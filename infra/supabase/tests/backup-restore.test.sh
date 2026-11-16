#!/usr/bin/env bash
# Infra checks of issues #172 and #265 for backups: backup.sh to S3 (a local MinIO container), encrypted, 14 newest
# copies kept, unencrypted copies made before #265 re-encrypted in place; restore.sh of the latest copy on an empty
# stack brings back synthetic users and data. The app's migrations are applied before the copy is made (#278): a
# restored database must go on creating a profile for every new account — the trigger for it sits on `auth.users`,
# outside the schema the copy is made of.
# Needs Docker. Run: infra/supabase/tests/backup-restore.test.sh
set -uo pipefail
. "$(dirname "$0")/lib.sh"

# MinIO's own images left Docker Hub in 2025; pgsty/minio is the maintained build of the same server.
MINIO_IMAGE=pgsty/minio:RELEASE.2026-08-04T00-00-00Z
EMAIL=synthetic-user@example.com

section 'подготовка: стек kz с миграциями и синтетическими данными, MinIO с бакетом'
new_region kz 8000 ENABLE_EMAIL_AUTOCONFIRM=true
use_region kz
"$INFRA_DIR/deploy.sh" || exit 1
"$INFRA_DIR/migrate.sh" || exit 1
api=$(local_api_url)
sql() { compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA -c "$1"; }
# The app's triggers on tables of other schemas (auth.users), as the database defines them.
outside_triggers() {
  sql "select coalesce(string_agg(pg_get_triggerdef(t.oid), '; ' order by t.tgname), '')
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal and c.relnamespace <> 'public'::regnamespace and p.pronamespace = 'public'::regnamespace"
}
# profile_of <e-mail>: the region in the user's profile, or nothing.
profile_of() { sql "select p.region from public.profiles p join auth.users u on u.id = p.user_id where u.email = '$1'"; }

export S3_ENDPOINT=http://127.0.0.1:9100 S3_BUCKET=lifeos-backups S3_REGION=us-east-1
export AWS_ACCESS_KEY_ID=ci-access-key AWS_SECRET_ACCESS_KEY=ci-secret-key-1234
docker rm -f lifeos-test-minio > /dev/null 2>&1
docker run -d --name lifeos-test-minio -p 127.0.0.1:9100:9000 \
  -e MINIO_ROOT_USER="$AWS_ACCESS_KEY_ID" -e MINIO_ROOT_PASSWORD="$AWS_SECRET_ACCESS_KEY" \
  "$MINIO_IMAGE" server /data > /dev/null || exit 1
cleanups+=('docker rm -f lifeos-test-minio')
for _ in $(seq 1 30); do curl -sf "$S3_ENDPOINT/minio/health/ready" > /dev/null && break; sleep 1; done
s3 "$WORK" s3 mb "s3://$S3_BUCKET" > /dev/null || exit 1

compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q << 'SQL' || exit 1
create table public.synthetic_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id),
  body text not null
);
alter table public.synthetic_notes enable row level security;
create policy own_notes on public.synthetic_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.synthetic_notes to authenticated;
notify pgrst, 'reload schema';
SQL

json_post() { curl -s -m 10 -X POST "$api$1" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' "${@:3}" -d "$2"; }
# The user's session goes on: prints a new access token for the refresh token the user got BEFORE the copy was made
# (there are no passwords to sign in with — migration 0002), or nothing. A refresh token works once, so this is asked
# once per database that has it; the last response stays in $WORK/login.json for the failure report.
login() {
  json_post '/auth/v1/token?grant_type=refresh_token' "{\"refresh_token\":\"$refresh_token\"}" > "$WORK/login.json"
  jq -r '.access_token // empty' "$WORK/login.json" 2> /dev/null
}
notes() { curl -s -m 10 "$api/rest/v1/synthetic_notes?select=body&order=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer ${1:-$ANON_KEY}" | jq -r 'map(.body) | join(",")'; }

new_user "$EMAIL" > "$WORK/session.json"
token=$(jq -r '.access_token // empty' "$WORK/session.json")
refresh_token=$(jq -r '.refresh_token // empty' "$WORK/session.json")
sleep 1
for body in первая вторая третья; do
  json_post /rest/v1/synthetic_notes "{\"body\":\"$body\"}" -H "Authorization: Bearer $token" > /dev/null
done
check 'синтетический пользователь видит свои 3 заметки' test "$(notes "$token")" == 'первая,вторая,третья'
check '…и получил профиль с регионом развёртывания (триггер миграции 0002 на auth.users)' test "$(profile_of "$EMAIL")" == kz
triggers_before=$(outside_triggers)
check '…триггеры приложения на таблице чужой схемы есть: lifeos_create_profile и lifeos_no_passwords на auth.users' \
  bash -c "grep -q 'lifeos_create_profile AFTER INSERT ON auth.users' <<< \"\$1\" &&
    grep -q 'lifeos_no_passwords BEFORE INSERT OR UPDATE ON auth.users' <<< \"\$1\"" _ "$triggers_before"

section 'backup.sh: pg_dump сжат, зашифрован и загружен в S3 (MinIO), хранятся 14 последних копий'
# 15 older encrypted copies plus 2 unencrypted ones made before #265 (newer than the rest) are already in the bucket:
# after one more backup the 2 old ones are re-encrypted in place and the 4 oldest of the 18 must go.
echo old > "$WORK/old.sql.gz.enc"
for day in $(seq -w 1 15); do
  s3 "$WORK" s3 cp --only-show-errors /work/old.sql.gz.enc "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-202601${day}T030000Z.sql.gz.enc"
done
printf 'legacy plaintext copy\n' | gzip > "$WORK/legacy.sql.gz"
for day in 16 17; do
  s3 "$WORK" s3 cp --only-show-errors /work/legacy.sql.gz "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-202601${day}T030000Z.sql.gz"
done
# Every object under the prefix, whatever its name.
object_names() { s3 "$WORK" s3 ls "s3://$S3_BUCKET/lifeos/kz/" | awk 'NF >= 4 {print $4}'; }
today=$(date -u +%Y%m%d)
check 'backup.sh завершается успешно' "$INFRA_DIR/backup.sh"
mapfile -t kept < <(list_backups "$WORK")
newest=${kept[-1]:-}
check 'в бакете 14 копий' test "${#kept[@]}" == 14
check 'самая новая — только что сделанная (сегодняшняя дата)' bash -c "[[ '$newest' == lifeos-kz-$today* || '$newest' == lifeos-kz-$(date -u +%Y%m%d)* ]]"
check 'четыре самые старые удалены' bash -c "[[ '${kept[0]}' == lifeos-kz-20260105T030000Z.sql.gz.enc ]]"
check 'старые незашифрованные копии (до #265) зашифрованы на месте: точки восстановления сохранены' \
  bash -c "[[ ' ${kept[*]} ' == *' lifeos-kz-20260116T030000Z.sql.gz.enc '* && ' ${kept[*]} ' == *' lifeos-kz-20260117T030000Z.sql.gz.enc '* ]]"
check '…копий в открытом виде в бакете не осталось' bash -c "! grep -q '\.sql\.gz\$' <<< '$(object_names)'"
s3 "$WORK" s3 cp --only-show-errors "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-20260116T030000Z.sql.gz.enc" /work/migrated.enc
decrypts_to() { decrypt_backup < "$1" | cmp -s - "$2"; }
check '…и расшифровываются в исходную копию' decrypts_to "$WORK/migrated.enc" "$WORK/legacy.sql.gz"
s3 "$WORK" s3 cp --only-show-errors "s3://$S3_BUCKET/lifeos/kz/$newest" "/work/$newest"
decrypt() { BACKUP_ENCRYPTION_KEY=$1 decrypt_backup < "$WORK/$newest"; }
check 'в бакете только зашифрованный файл (заголовок OpenSSL, не gzip)' \
  bash -c "[[ \$(head -c 8 '$WORK/$newest') == Salted__ ]] && ! gzip -t '$WORK/$newest' 2> /dev/null"
check 'без ключа (с чужим ключом) копию не распаковать' \
  bash -c "! (BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32); . '$INFRA_DIR/lib.sh'; decrypt_backup < '$WORK/$newest' | gunzip -t) 2> /dev/null"
decrypt "$BACKUP_ENCRYPTION_KEY" > "$WORK/plain.sql.gz"
check 'с ключом — gzip' gzip -t "$WORK/plain.sql.gz"
check 'внутри — pg_dump с данными auth и public' \
  bash -c "gunzip -c '$WORK/plain.sql.gz' | grep -q 'COPY auth.users' && gunzip -c '$WORK/plain.sql.gz' | grep -q 'COPY public.synthetic_notes'"
check '…и триггеры приложения на таблицах других схем (pg_dump --schema=public их не берёт): создание профиля на auth.users' \
  bash -c "gunzip -c '$WORK/plain.sql.gz' | grep -q '^CREATE TRIGGER lifeos_create_profile AFTER INSERT ON auth.users '"

section 'backup.sh не смог сделать копию → уведомление в webhook (заглушка)'
hooks="$WORK/hooks.log"
: > "$hooks"
python3 -I "$TESTS_DIR/webhook-stub.py" 9199 "$hooks" &
cleanups+=("kill $!")
sleep 1
check 'копия в несуществующий бакет: код не 0' \
  bash -c "! ALERT_WEBHOOK_URL=http://127.0.0.1:9199/alert S3_BUCKET=no-such-bucket '$INFRA_DIR/backup.sh' 2> /dev/null"
check '…уведомление «резервная копия не создана» отправлено' grep -q 'резервная копия не создана' "$hooks"
: > "$hooks"
# Every object under the prefix, whatever its name: a plaintext upload must not slip past under another suffix.
all_objects() { s3 "$WORK" s3 ls "s3://$S3_BUCKET/lifeos/kz/" | wc -l; }
before=$(all_objects)
check 'ключа шифрования нет: backup.sh отказывается работать' \
  bash -c "! ALERT_WEBHOOK_URL=http://127.0.0.1:9199/alert BACKUP_ENCRYPTION_KEY= '$INFRA_DIR/backup.sh' 2> '$WORK/nokey.log' && grep -q BACKUP_ENCRYPTION_KEY '$WORK/nokey.log'"
check '…копия в открытом виде не загружена' test "$(all_objects)" == "$before"
check '…уведомление отправлено' grep -q 'резервная копия не создана' "$hooks"
check 'ключ короче 32 символов: backup.sh отказывается работать' \
  bash -c "! BACKUP_ENCRYPTION_KEY=short '$INFRA_DIR/backup.sh' 2> '$WORK/short.log' && grep -q 'короче 32' '$WORK/short.log'"
check '…ничего не загружено' test "$(all_objects)" == "$before"

section 'migrate-backups.sh: старые незашифрованные копии шифруются на месте, повреждённые не трогает, повтор безопасен'
s3 "$WORK" s3 cp --only-show-errors /work/legacy.sql.gz "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-20260120T030000Z.sql.gz"
printf 'not a gzip file\n' > "$WORK/corrupt.sql.gz"
s3 "$WORK" s3 cp --only-show-errors /work/corrupt.sql.gz "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-20260121T030000Z.sql.gz"
check 'повреждённая старая копия: migrate-backups.sh завершается с ошибкой и называет её' \
  bash -c "! '$INFRA_DIR/migrate-backups.sh' 2> '$WORK/migrate.log' && grep -q 'lifeos-kz-20260121T030000Z.sql.gz' '$WORK/migrate.log'"
check '…целая зашифрована, открытая удалена' \
  bash -c "grep -qx lifeos-kz-20260120T030000Z.sql.gz.enc <<< '$(object_names)' && ! grep -qx lifeos-kz-20260120T030000Z.sql.gz <<< '$(object_names)'"
check '…повреждённая не удалена и не зашифрована' \
  bash -c "grep -qx lifeos-kz-20260121T030000Z.sql.gz <<< '$(object_names)' && ! grep -qx lifeos-kz-20260121T030000Z.sql.gz.enc <<< '$(object_names)'"
: > "$hooks"
check 'backup.sh при оставшейся открытой копии: код не 0' \
  bash -c "! ALERT_WEBHOOK_URL=http://127.0.0.1:9199/alert '$INFRA_DIR/backup.sh' 2> /dev/null"
check '…уведомление о незашифрованных копиях отправлено' grep -q 'незашифрованные' "$hooks"
s3 "$WORK" s3 rm --only-show-errors "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-20260121T030000Z.sql.gz"
check 'повреждённая удалена вручную: migrate-backups.sh завершается успешно' "$INFRA_DIR/migrate-backups.sh"
check '…повторный запуск тоже' "$INFRA_DIR/migrate-backups.sh"
check '…копий в открытом виде в бакете нет' bash -c "! grep -q '\.sql\.gz\$' <<< '$(object_names)'"
check 'restore.sh не принимает имя открытой копии и подсказывает migrate-backups.sh' \
  bash -c "! '$INFRA_DIR/restore.sh' lifeos-kz-20260120T030000Z.sql.gz 2> '$WORK/legacy-name.log' && grep -q migrate-backups.sh '$WORK/legacy-name.log'"

section 'restore.sh последней (зашифрованной) копии на пустом стеке восстанавливает синтетические данные'
"$INFRA_DIR/restore.sh" > /dev/null 2> "$WORK/refused.log"
refused=$?
check 'restore.sh отказывается писать поверх данных' \
  bash -c "(( $refused != 0 )) && grep -q 'стек не пустой' '$WORK/refused.log'"
check '…и не трогает работающий стек: API отвечает' test "$(api_status /auth/v1/health "$ANON_KEY")" == 200
check '…заметки на месте' test "$(notes "$token")" == 'первая,вторая,третья'
compose down -v > /dev/null 2>&1
SKIP_PULL=1 "$INFRA_DIR/deploy.sh" > /dev/null 2>&1
check 'новый стек пуст: сессию пользователя он не знает' test -z "$(login)"
# A broken copy (valid name, not SQL) must fail without leaving the stack half-restored or stopped.
printf 'this is not a database dump;\n' | gzip | encrypt_backup > "$WORK/broken.sql.gz.enc"
s3 "$WORK" s3 cp --only-show-errors /work/broken.sql.gz.enc "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-20000101T000000Z.sql.gz.enc"
check 'битая копия: restore.sh завершается с ошибкой' \
  bash -c "! '$INFRA_DIR/restore.sh' lifeos-kz-20000101T000000Z.sql.gz.enc 2> /dev/null"
check '…API снова отвечает' test "$(api_status /auth/v1/health "$ANON_KEY")" == 200
check 'чужой ключ: restore.sh завершается с ошибкой «не расшифровать»' \
  bash -c "! BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32) '$INFRA_DIR/restore.sh' 2> '$WORK/wrongkey.log' && grep -q 'не расшифровать' '$WORK/wrongkey.log'"
check '…API отвечает' test "$(api_status /auth/v1/health "$ANON_KEY")" == 200
check '…база осталась пустой' test "$(compose exec -T db psql -U supabase_admin -d postgres -tAc 'select count(*) from auth.users')" == 0
check 'restore.sh завершается успешно' "$INFRA_DIR/restore.sh"
token=$(login)
check 'сессия пользователя пережила восстановление: его токен обновления принят, выдан новый токен доступа' test -n "$token"
[[ -n $token ]] || echo "    ответ: $(tr -d '\n' < "$WORK/login.json")"
check 'его 3 заметки на месте' test "$(notes "$token")" == 'первая,вторая,третья'
check 'RLS работает: без входа заметок не видно' test -z "$(notes)"
status=$(json_post /rest/v1/synthetic_notes '{"body":"после восстановления"}' -H "Authorization: Bearer $token" -o /dev/null -w '%{http_code}')
check 'новые записи после восстановления сохраняются' test "$status" == 201

section 'восстановленная база ведёт себя как исходная: миграции учтены, новый аккаунт получает профиль с регионом ячейки'
check 'migrate.sh после восстановления ничего не применяет: журнал миграций приехал с копией' \
  bash -c "'$INFRA_DIR/migrate.sh' 2>&1 | grep -q 'применено миграций — 0'"
check 'триггеры приложения на таблицах других схем — те же, что в исходной базе (создание профиля на auth.users)' \
  test "$(outside_triggers)" == "$triggers_before"
check 'профиль восстановленного пользователя на месте' test "$(profile_of "$EMAIL")" == kz
new_user after-restore@example.com > /dev/null
check 'новый аккаунт после восстановления получает профиль с регионом ячейки' \
  test "$(profile_of after-restore@example.com)" == kz
check '…и остаётся без пароля, как и восстановленный: триггер lifeos_no_passwords работает' \
  test "$(sql 'select count(*) from auth.users where encrypted_password is not null')" == 0
check '…пользователей без профиля нет' \
  test "$(sql 'select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id)')" == 0

finish
