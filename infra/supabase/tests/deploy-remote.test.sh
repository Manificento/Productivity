#!/usr/bin/env bash
# Infra checks of issue #284: the «Deploy KZ» workflow and deploy-remote.sh, the script it runs. There is no real
# server in CI: the same script deploys over SSH to the runner itself (a private sshd on 127.0.0.1:2222, logged in as
# the current user), with MinIO instead of the bucket and a webhook stub instead of the alert channel.
# Needs Docker, sshd (openssh-server), crontab and yq. Run: infra/supabase/tests/deploy-remote.test.sh
set -uo pipefail
. "$(dirname "$0")/lib.sh"

REPO_DIR=$(cd "$INFRA_DIR/../.." && pwd)
WORKFLOW=$REPO_DIR/.github/workflows/deploy-kz.yml
MINIO_IMAGE=pgsty/minio:RELEASE.2026-08-04T00-00-00Z
SSH_TEST_PORT=2222
SERVER=$WORK/server # DEPLOY_DIR on the test "server"
SERVER_ENV=$SERVER/kz.env
SERVER_CODE=$SERVER/app/infra/supabase

# The secrets of the production-kz environment, as the workflow passes them to deploy-remote.sh.
SECRET_NAMES=(SSH_HOST SSH_USER SSH_PRIVATE_KEY SSH_KNOWN_HOSTS DOMAIN SITE_URL SMTP_HOST SMTP_USER SMTP_PASS
  SMTP_ADMIN_EMAIL S3_ENDPOINT S3_REGION S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BACKUP_ENCRYPTION_KEY
  ALERT_WEBHOOK_URL)

fails() { ! "$@"; }

section 'Deploy KZ: только ручной запуск, окружение production-kz, без секретов останавливается на первом шаге'
check 'workflow «Deploy KZ» запускается только вручную: нет push, pull_request и расписания' \
  test "$(yq -r '.on | keys | join(" ")' "$WORKFLOW")" == workflow_dispatch
check 'единственная задача использует окружение production-kz' \
  test "$(yq -r '[.jobs[].environment] | join(" ")' "$WORKFLOW")" == production-kz
check 'первый шаг — проверка секретов, ещё до checkout' \
  test "$(yq -r '.jobs[].steps[0] | has("uses")' "$WORKFLOW")" == false
check '…ему передаются ровно обязательные секреты' \
  test "$(yq -r '.jobs[].steps[0].env | keys | sort | join(" ")' "$WORKFLOW")" == \
  "$(printf '%s\n' "${SECRET_NAMES[@]}" | sort | paste -sd ' ')"
check 'секреты не заданы на уровне задачи: сторонние шаги (checkout) их не видят' \
  bash -c "! yq -r '.jobs[].env // {} | .[]' '$WORKFLOW' | grep -q 'secrets\.'"
check 'сторонние действия закреплены на SHA коммита' \
  bash -c "! yq -r '.jobs[].steps[].uses // \"\"' '$WORKFLOW' | grep -v '^\$' | grep -vqE '@[0-9a-f]{40}\$'"
missing_in_workflow=()
for name in "${SECRET_NAMES[@]}" SSH_PORT SMTP_PORT; do
  [[ $(yq -r ".jobs[].steps[-1].env.$name" "$WORKFLOW") == "\${{ secrets.$name }}" ]] || missing_in_workflow+=("$name")
done
check "шаг деплоя получает все секреты окружения (не хватает: ${missing_in_workflow[*]:-—})" \
  test "${#missing_in_workflow[@]}" == 0

# The first step exactly as GitHub runs it: `bash --noprofile --norc -eo pipefail`.
first_step() { env -i PATH="$PATH" HOME="$HOME" "$@" bash --noprofile --norc -eo pipefail -c "$(yq -r '.jobs[].steps[0].run' "$WORKFLOW")"; }
no_secrets_log=$WORK/no-secrets.log
first_step GITHUB_REF=refs/heads/main > "$no_secrets_log" 2>&1
no_secrets_code=$?
check 'секреты не заданы: первый шаг завершается с ошибкой' test "$no_secrets_code" != 0
listed=()
for name in "${SECRET_NAMES[@]}"; do grep -qw "$name" "$no_secrets_log" && listed+=("$name"); done
check '…и называет все недостающие секреты' test "${#listed[@]}" == "${#SECRET_NAMES[@]}"
check '…сообщение об ошибке видно в GitHub (::error)' grep -q '^::error' "$no_secrets_log"
all_secrets=()
for name in "${SECRET_NAMES[@]}"; do all_secrets+=("$name=x"); done
check 'секреты заданы, запуск из main: первый шаг проходит' first_step GITHUB_REF=refs/heads/main "${all_secrets[@]}"
check 'запуск не из ветки main: первый шаг останавливается' \
  fails first_step GITHUB_REF=refs/heads/feat/999 "${all_secrets[@]}"
env -i PATH="$PATH" HOME="$HOME" DEPLOY_DIR="$SERVER" "$INFRA_DIR/deploy-remote.sh" > /dev/null 2>&1
check 'деплой без секретов и сам останавливается до подключения к серверу' \
  bash -c "(( $? != 0 )) && [[ ! -e '$SERVER' ]]"

section 'подготовка: тестовый «сервер» — этот же компьютер по SSH, MinIO вместо бакета, заглушка канала уведомлений'
ssh_dir=$WORK/ssh
mkdir -p "$ssh_dir"
chmod 700 "$ssh_dir"
ssh-keygen -q -t ed25519 -N '' -C lifeos-test-host -f "$ssh_dir/host_key" || exit 1
ssh-keygen -q -t ed25519 -N '' -C lifeos-test-deploy -f "$ssh_dir/deploy_key" || exit 1
cp "$ssh_dir/deploy_key.pub" "$ssh_dir/authorized_keys"
cat > "$ssh_dir/sshd_config" << EOF
Port $SSH_TEST_PORT
ListenAddress 127.0.0.1
HostKey $ssh_dir/host_key
PidFile $ssh_dir/sshd.pid
AuthorizedKeysFile $ssh_dir/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
UsePAM no
StrictModes no
EOF
# SKIP_PULL=1 (images already local, e.g. when Docker Hub limits pulls) reaches deploy.sh on the "server" too.
[[ ${SKIP_PULL:-} != 1 ]] || echo 'SetEnv SKIP_PULL=1' >> "$ssh_dir/sshd_config"
# sshd as root needs its privilege separation directory (a non-root sshd runs without one).
((EUID != 0)) || mkdir -p /run/sshd
/usr/sbin/sshd -f "$ssh_dir/sshd_config" -E "$ssh_dir/sshd.log" || {
  cat "$ssh_dir/sshd.log"
  exit 1
}
cleanups+=("kill \$(cat '$ssh_dir/sshd.pid')")

export S3_ENDPOINT=http://127.0.0.1:9100 S3_BUCKET=lifeos-backups S3_REGION=us-east-1
export AWS_ACCESS_KEY_ID=ci-access-key AWS_SECRET_ACCESS_KEY=ci-secret-key-1234
docker rm -f lifeos-test-minio > /dev/null 2>&1
docker run -d --name lifeos-test-minio -p 127.0.0.1:9100:9000 \
  -e MINIO_ROOT_USER="$AWS_ACCESS_KEY_ID" -e MINIO_ROOT_PASSWORD="$AWS_SECRET_ACCESS_KEY" \
  "$MINIO_IMAGE" server /data > /dev/null || exit 1
cleanups+=('docker rm -f lifeos-test-minio')
for _ in $(seq 1 30); do curl -sf "$S3_ENDPOINT/minio/health/ready" > /dev/null && break; sleep 1; done
s3 "$WORK" s3 mb "s3://$S3_BUCKET" > /dev/null || exit 1

hooks=$WORK/hooks.log
: > "$hooks"
python3 -I "$TESTS_DIR/webhook-stub.py" 9199 "$hooks" &
cleanups+=("kill $!")

# The stack, the proxy and the schedule of the test server are removed on exit, whatever state the test left.
remove_schedule() {
  local rest
  rest=$(crontab -l 2> /dev/null | awk '/^# >>> lifeos-kz /{skip=1} !skip{print} /^# <<< lifeos-kz/{skip=0}')
  if [[ -n $rest ]]; then crontab - <<< "$rest"; else crontab -r 2> /dev/null || true; fi
}
cleanups+=(remove_schedule)
cleanups+=("ENV_FILE='$SERVER_ENV' REGION=kz compose down -v --remove-orphans")
docker compose -p lifeos-kz down -v --remove-orphans > /dev/null 2>&1

# Every secret of production-kz, with test values. SMTP_PASS has characters a shell or Compose would expand.
export SSH_HOST=127.0.0.1 SSH_USER SSH_PRIVATE_KEY SSH_KNOWN_HOSTS
SSH_USER=$(id -un)
SSH_PRIVATE_KEY=$(cat "$ssh_dir/deploy_key")
SSH_KNOWN_HOSTS="[127.0.0.1]:$SSH_TEST_PORT $(cat "$ssh_dir/host_key.pub")"
export DOMAIN=localhost SITE_URL=https://app.example.kz
# shellcheck disable=SC2016 # literally: the password must reach the server unexpanded
export SMTP_HOST=smtp.example.kz SMTP_USER=lifeos SMTP_PASS='p@ss $word"`x`' SMTP_ADMIN_EMAIL=admin@example.kz
export BACKUP_ENCRYPTION_KEY
BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)
export ALERT_WEBHOOK_URL=http://127.0.0.1:9199/alert
# Not secrets: where the test server keeps the code and which ports its proxy takes (443/80 on a real server).
export SSH_PORT=$SSH_TEST_PORT DEPLOY_DIR=$SERVER PROXY_HTTPS_PORT=8443 PROXY_HTTP_PORT=8088
# The workflow deploys only commits of origin/main; the commit under test is not on main yet, so here «main» is HEAD.
export MAIN_REF=HEAD
# The run summary of «Deploy KZ» (GitHub sets it for every step); in the Infra workflow it must not be CI's own one.
export GITHUB_STEP_SUMMARY=$WORK/summary.md

ALERT_WEBHOOK_URL='' "$INFRA_DIR/deploy-remote.sh" > "$WORK/missing-one.log" 2>&1
names_only_webhook() { grep -qw ALERT_WEBHOOK_URL "$1" && ! grep -qw SMTP_PASS "$1"; }
check 'не задан один секрет: деплой называет только его' names_only_webhook "$WORK/missing-one.log"
check '…и ничего не меняет на сервере' test ! -e "$SERVER"

# A commit that is not in the history of «main» (an unreviewed branch): only an object, no ref is created or moved.
foreign=$(GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.kz GIT_COMMITTER_NAME=test \
  GIT_COMMITTER_EMAIL=test@example.kz git -C "$REPO_DIR" commit-tree 'HEAD^{tree}' -p HEAD -m 'не из main')
REVISION=$foreign "$INFRA_DIR/deploy-remote.sh" > "$WORK/foreign.log" 2>&1
foreign_code=$?
check 'ревизия не из истории main: деплой отказывается' \
  bash -c "(( $foreign_code != 0 )) && grep -q 'не из истории' '$WORK/foreign.log'"
check '…и ничего не меняет на сервере' test ! -e "$SERVER"

section 'секреты заданы: код ревизии, файл настроек из секретов (600), deploy.sh, HTTPS-прокси, расписание'
deploy_log=$WORK/deploy.log
"$INFRA_DIR/deploy-remote.sh" > "$deploy_log" 2>&1
deploy_code=$?
check 'deploy-remote.sh по SSH завершается успешно' test "$deploy_code" == 0
if ((deploy_code != 0)); then
  tail -n 40 "$deploy_log"
  finish
fi
check 'на сервере код выбранной ревизии' \
  bash -c "[[ \$(cat '$SERVER/app/REVISION') == \$(git -C '$REPO_DIR' rev-parse HEAD) && -x '$SERVER_CODE/deploy.sh' ]]"
check 'файл настроек региона: права 600' test "$(stat -c %a "$SERVER_ENV")" == 600
declare -A server_env=()
read_env_file "$SERVER_ENV" server_env
check 'файл настроек собран из секретов: домен, SMTP, бакет, ключ копий, канал уведомлений' \
  test "${server_env[SUPABASE_PUBLIC_URL]}|${server_env[SMTP_PASS]}|${server_env[S3_BUCKET]}|${server_env[BACKUP_ENCRYPTION_KEY]}|${server_env[ALERT_WEBHOOK_URL]}" == \
  "https://localhost:8443|$SMTP_PASS|$S3_BUCKET|$BACKUP_ENCRYPTION_KEY|$ALERT_WEBHOOK_URL"
check 'секреты базы созданы на сервере' bash -c "[[ '${server_env[JWT_SECRET]:-}' =~ ^[0-9a-f]{64}$ ]]"

# leaked_into <file…>: the names of the closed secrets whose values are in any of the files, in `leaked`. The anon key
# and the public URL are public by design (the app holds them); everything else here is not.
leaked_into() {
  local name part
  leaked=()
  for name in SSH_PRIVATE_KEY SMTP_PASS AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BACKUP_ENCRYPTION_KEY ALERT_WEBHOOK_URL; do
    # Every line of the value (the SSH key has several), except the key's BEGIN/END markers.
    while IFS= read -r part; do
      [[ -z $part || $part == -----* ]] && continue
      if grep -qF -- "$part" "$@"; then
        leaked+=("$name")
        break
      fi
    done <<< "${!name}"
  done
  for name in POSTGRES_PASSWORD JWT_SECRET SERVICE_ROLE_KEY PG_META_CRYPTO_KEY; do
    grep -qF -- "${server_env[$name]:-unset}" "$@" && leaked+=("$name")
  done
}
leaked_into "$deploy_log"
check "значения секретов не попадают в журнал деплоя (попали: ${leaked[*]:-—})" test "${#leaked[@]}" == 0

# The values the app's build needs, as Vite reads them (src/core/sync/config.ts).
check 'итог запуска: публичный адрес API — переменная сборки VITE_SUPABASE_URL_KZ' \
  grep -qxF 'VITE_SUPABASE_URL_KZ=https://localhost:8443' "$GITHUB_STEP_SUMMARY"
check '…и публичный ключ клиента — VITE_SUPABASE_ANON_KEY_KZ (ключ anon с сервера)' \
  grep -qxF "VITE_SUPABASE_ANON_KEY_KZ=${server_env[ANON_KEY]}" "$GITHUB_STEP_SUMMARY"
leaked_into "$GITHUB_STEP_SUMMARY"
check "закрытые значения в итог запуска не попадают (попали: ${leaked[*]:-—})" test "${#leaked[@]}" == 0
check 'первый деплой создал базу: о SQL первичной инициализации в журнале ни слова' \
  bash -c "! grep -q 'только на пустой базе' '$deploy_log'"

# From here on the lib.sh helpers (compose, api_status…) act on the test server's stack.
use_server() {
  local key
  for key in "${!server_env[@]}"; do unset "$key"; done
  export ENV_FILE=$SERVER_ENV
  load_env
}
use_server
container_env() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(compose ps -q "$1")"; }
check 'Auth получил пароль SMTP без искажений (кавычки, $ и ` не раскрыты)' \
  grep -qxF "GOTRUE_SMTP_PASS=$SMTP_PASS" <(container_env auth)

check 'deploy.sh поднял стек с миграциями: схема Auth создана' \
  test "$(compose exec -T db psql -U supabase_admin -d postgres -tAc 'select count(*) > 0 from auth.schema_migrations')" == t
check 'в конце деплой проверил GET /auth/v1/health и GET /rest/v1/ по HTTPS' \
  grep -q 'по HTTPS: GET /auth/v1/health и GET /rest/v1/ — 200' "$deploy_log"
# Caddy issues the certificate for localhost from its own CA (a real domain gets one from Let's Encrypt).
compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt > "$WORK/proxy-ca.crt"
https_status() {
  curl -s -o /dev/null -w '%{http_code}' -m 10 --cacert "$WORK/proxy-ca.crt" \
    -H "apikey: $2" -H "Authorization: Bearer $2" "https://localhost:8443$1"
}
check 'обратный прокси отдаёт API по HTTPS для домена: GET /auth/v1/health → 200' \
  test "$(https_status /auth/v1/health "$ANON_KEY")" == 200
check '…GET /rest/v1/ с ключом service_role → 200' test "$(https_status /rest/v1/ "$SERVICE_ROLE_KEY")" == 200

schedule=$(crontab -l 2> /dev/null)
backup_line=$(grep -E '^0 22 \* \* \* .*\./backup\.sh' <<< "$schedule")
health_line=$(grep -E '^\*/5 \* \* \* \* .*\./healthcheck\.sh' <<< "$schedule")
check 'расписание: ночной backup.sh (22:00 UTC = 03:00 по Алматы)' test -n "$backup_line"
check 'расписание: healthcheck.sh каждые 5 минут' test -n "$health_line"
check '…время расписания — UTC' grep -qx 'CRON_TZ=UTC' <<< "$schedule"
check '…задания берут код и настройки сервера' \
  bash -c "[[ '$backup_line' == *'cd $SERVER_CODE && ENV_FILE=$SERVER_ENV ./backup.sh'* ]]"
# A cron line without the schedule and the `2>&1 | logger …` tail: the command whose exit code matters.
cron_command() {
  local line=${1#* * * * * } tail=' 2>&1'
  echo "${line%%"$tail"*}"
}
# Runs it the way cron does: a bare environment, everything else comes from the server's settings file.
as_cron() { env -i PATH="$PATH" HOME="$HOME" "${@:2}" bash -c "$(cron_command "$1")"; }
echo old > "$WORK/old.sql.gz.enc"
for day in $(seq -w 1 14); do
  s3 "$WORK" s3 cp --only-show-errors /work/old.sql.gz.enc "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-202601${day}T030000Z.sql.gz.enc"
done
check 'ночное задание backup.sh проходит: копия в MinIO' as_cron "$backup_line"
mapfile -t kept < <(list_backups "$WORK")
check '…хранятся 14 копий, самая новая — сегодняшняя' \
  bash -c "[[ ${#kept[@]} == 14 && '${kept[-1]:-}' == lifeos-kz-$(date -u +%Y%m%d)* ]]"

section 'повторный запуск с изменённым секретом: секреты базы не перевыпускаются, данные не теряются'
compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  -c 'create table public.deploy_probe (body text)' -c "insert into public.deploy_probe values ('до повторного деплоя')"
probe() { compose exec -T db psql -U supabase_admin -d postgres -tAc 'select body from public.deploy_probe'; }
db_before=$(compose ps -q db)
auth_before=$(compose ps -q auth)
kong_before=$(compose ps -q kong)
proxy_before=$(compose ps -q proxy)
# The owner changed a setting on the server by hand (more copies kept); the deploy must not undo it.
sed -i 's/^BACKUP_KEEP=.*/BACKUP_KEEP=30/' "$SERVER_ENV"
# A rotated secret: Auth is recreated with it, the database is not.
# shellcheck disable=SC2016 # literally
export SMTP_PASS='новый p@ss $2'
"$INFRA_DIR/deploy-remote.sh" > "$WORK/redeploy.log" 2>&1
redeploy_code=$?
check 'повторный deploy-remote.sh завершается успешно' test "$redeploy_code" == 0
((redeploy_code == 0)) || tail -n 40 "$WORK/redeploy.log"
declare -A again=()
read_env_file "$SERVER_ENV" again
same=1
for name in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY PG_META_CRYPTO_KEY; do
  [[ ${again[$name]:-} == "${server_env[$name]:-unset}" ]] || same=0
done
check 'секреты базы (пароль, JWT, ключи anon/service) те же' test "$same" == 1
check 'новый секрет записан в файл настроек' test "${again[SMTP_PASS]:-}" == "$SMTP_PASS"
auth_recreated_with_new_pass() {
  [[ $(compose ps -q auth) != "$auth_before" ]] && grep -qxF "GOTRUE_SMTP_PASS=$SMTP_PASS" <(container_env auth)
}
check '…и Auth пересоздан с ним' auth_recreated_with_new_pass
check 'настройка, изменённая на сервере вручную (BACKUP_KEEP=30), сохранена' test "${again[BACKUP_KEEP]:-}" == 30
check 'файл настроек по-прежнему 600' test "$(stat -c %a "$SERVER_ENV")" == 600
check 'база не пересоздана: тот же контейнер db' test "$(compose ps -q db)" == "$db_before"
check 'код заменён, но kong.yml и Caddyfile те же: kong и proxy не пересозданы' \
  test "$(compose ps -q kong)|$(compose ps -q proxy)" == "$kong_before|$proxy_before"
check 'SQL первичной инициализации не менялся: о нём в журнале ни слова' \
  bash -c "! grep -q 'только на пустой базе' '$WORK/redeploy.log'"
check 'данные на месте' test "$(probe)" == 'до повторного деплоя'
check 'API отвечает с прежним ключом anon' test "$(api_status /auth/v1/health "$ANON_KEY")" == 200
check '…и с прежним ключом service_role' test "$(api_status /rest/v1/ "$SERVICE_ROLE_KEY")" == 200
check 'задания в расписании не задвоились' test "$(crontab -l | grep -cE '\./(backup|healthcheck)\.sh')" == 2

section 'файла настроек нет, а база уже есть: новые секреты не создаются'
mv "$SERVER_ENV" "$WORK/kz.env.saved"
"$INFRA_DIR/deploy-remote.sh" > "$WORK/lost-env.log" 2>&1
lost_env_code=$?
check 'деплой останавливается' test "$lost_env_code" != 0
check '…и просит вернуть файл из менеджера паролей' grep -q 'менеджера паролей' "$WORK/lost-env.log"
check '…новый файл настроек не создан' bash -c "! compgen -G '$SERVER/kz.env*' > /dev/null"
mv "$WORK/kz.env.saved" "$SERVER_ENV"
check 'база не тронута: тот же контейнер db' test "$(compose ps -q db)" == "$db_before"
check '…данные на месте' test "$(probe)" == 'до повторного деплоя'
check '…API отвечает с прежними ключами' \
  test "$(api_status /auth/v1/health "$ANON_KEY")|$(api_status /rest/v1/ "$SERVICE_ROLE_KEY")" == '200|200'

section 'новая ревизия меняет kong.yml, Caddyfile, SQL первичной инициализации и значения по умолчанию в env.example'
# new_revision <path> <sed script>…: a commit of «main» = HEAD with the files edited (an object only: no ref moves).
new_revision() {
  local index=$WORK/revision.index blob tree
  GIT_INDEX_FILE=$index git -C "$REPO_DIR" read-tree HEAD || return 1
  while (($# >= 2)); do
    blob=$(git -C "$REPO_DIR" show "HEAD:infra/supabase/$1" | sed "$2" | git -C "$REPO_DIR" hash-object -w --stdin)
    GIT_INDEX_FILE=$index git -C "$REPO_DIR" update-index --cacheinfo "100644,$blob,infra/supabase/$1" || return 1
    shift 2
  done
  tree=$(GIT_INDEX_FILE=$index git -C "$REPO_DIR" write-tree) || return 1
  GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.kz GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.kz \
    git -C "$REPO_DIR" commit-tree "$tree" -p HEAD -m 'новая ревизия main'
}
# BACKUP_KEEP was changed by the owner (30), DISK_ALERT_PERCENT was not (85, the old default). `$a` is sed's «append».
# shellcheck disable=SC2016
revision=$(new_revision \
  volumes/api/kong.yml '$a # kong.yml новой ревизии' \
  volumes/proxy/Caddyfile '$a # Caddyfile новой ревизии' \
  volumes/db/roles.sql '$a -- roles.sql новой ревизии' \
  env.example 's/^BACKUP_KEEP=14$/BACKUP_KEEP=20/; s/^DISK_ALERT_PERCENT=85$/DISK_ALERT_PERCENT=90/')
kong_before=$(compose ps -q kong)
proxy_before=$(compose ps -q proxy)
auth_before=$(compose ps -q auth)
rest_before=$(compose ps -q rest)
revision_log=$WORK/revision.log
: > "$GITHUB_STEP_SUMMARY"
MAIN_REF=$revision REVISION=$revision "$INFRA_DIR/deploy-remote.sh" > "$revision_log" 2>&1
revision_code=$?
check 'deploy-remote.sh новой ревизии завершается успешно' test "$revision_code" == 0
((revision_code == 0)) || tail -n 40 "$revision_log"
check '…на сервере код новой ревизии' test "$(cat "$SERVER/app/REVISION")" == "$revision"

running_file_has() { compose exec -T "$1" grep -qF "$3" "$2"; }
check 'изменился kong.yml: kong пересоздан и работает с новым файлом' \
  bash -c "[[ \$1 != '$kong_before' ]]" _ "$(compose ps -q kong)"
check '…kong читает kong.yml новой ревизии' running_file_has kong /home/kong/temp.yml 'kong.yml новой ревизии'
check 'изменился Caddyfile: proxy пересоздан и работает с новым файлом' \
  bash -c "[[ \$1 != '$proxy_before' ]]" _ "$(compose ps -q proxy)"
check '…proxy читает Caddyfile новой ревизии' running_file_has proxy /etc/caddy/Caddyfile 'Caddyfile новой ревизии'
check 'контейнеры без изменений не тронуты: db, auth, rest те же' \
  test "$(compose ps -q db)|$(compose ps -q auth)|$(compose ps -q rest)" == "$db_before|$auth_before|$rest_before"
check '…API по HTTPS отвечает через новые kong и proxy' \
  test "$(https_status /auth/v1/health "$ANON_KEY")|$(https_status /rest/v1/ "$SERVICE_ROLE_KEY")" == '200|200'

init_sql_line=$(grep 'roles.sql' "$revision_log" | grep 'только на пустой базе' | grep 'миграц')
check 'изменился SQL первичной инициализации, а база с данными: в журнале ясная строка, что roles.sql действует только на пустой базе, а схема меняется миграциями' \
  test -n "$init_sql_line"
check '…база не пересоздана, данные на месте' \
  test "$(compose ps -q db)|$(probe)" == "$db_before|до повторного деплоя"

declare -A revised=()
read_env_file "$SERVER_ENV" revised
check 'значение по умолчанию изменилось, ключ не меняли на сервере (DISK_ALERT_PERCENT): новое значение' \
  test "${revised[DISK_ALERT_PERCENT]:-}" == 90
check 'значение по умолчанию изменилось, ключ меняли на сервере (BACKUP_KEEP=30): значение владельца сохранено' \
  test "${revised[BACKUP_KEEP]:-}" == 30
defaults_line=$(grep 'по умолчанию' "$revision_log" | grep -w DISK_ALERT_PERCENT)
kept_line=$(grep 'изменённые на сервере' "$revision_log" | grep -w BACKUP_KEEP)
check '…журнал называет ключ с новым значением по умолчанию по имени, без значения' \
  bash -c "[[ -n \$1 && \$1 != *90* && \$1 != *85* && \$1 != *BACKUP_KEEP* ]]" _ "$defaults_line"
check '…и ключ, сохранённый за владельцем, по имени, без значения' \
  bash -c "[[ -n \$1 && \$1 != *30* && \$1 != *20* && \$1 != *DISK_ALERT_PERCENT* ]]" _ "$kept_line"
check 'секреты базы те же' \
  test "${revised[JWT_SECRET]:-}|${revised[ANON_KEY]:-}" == "${server_env[JWT_SECRET]}|${server_env[ANON_KEY]}"

check 'итог запуска новой ревизии: адрес API и ключ anon' \
  bash -c "grep -qxF 'VITE_SUPABASE_URL_KZ=https://localhost:8443' '$GITHUB_STEP_SUMMARY' &&
    grep -qxF 'VITE_SUPABASE_ANON_KEY_KZ=${server_env[ANON_KEY]}' '$GITHUB_STEP_SUMMARY'"
leaked_into "$WORK/redeploy.log" "$WORK/lost-env.log" "$revision_log" "$GITHUB_STEP_SUMMARY"
check "закрытые значения не попали ни в один журнал деплоя и в итог (попали: ${leaked[*]:-—})" test "${#leaked[@]}" == 0

section 'контейнер упал → задание healthcheck.sh из расписания шлёт уведомление (заглушка канала)'
compose stop rest > /dev/null 2>&1
: > "$hooks"
check 'задание healthcheck.sh: код не 0' \
  fails as_cron "$health_line" HEALTH_STATE_FILE="$WORK/health-state" DISK_ALERT_PERCENT=100
check '…уведомление о контейнере rest отправлено в ALERT_WEBHOOK_URL из секретов' grep -q 'контейнер rest' "$hooks"

finish
