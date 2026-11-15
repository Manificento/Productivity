#!/usr/bin/env bash
# Deploys one region to its own server over SSH (#284): uploads the code of a revision, then provision.sh on the server
# builds the settings file from the secrets, runs deploy.sh with the HTTPS reverse proxy, installs the cron schedule
# and checks the API by HTTPS. Run by the «Deploy KZ» workflow; the Infra workflow runs the same script against a test
# server (tests/deploy-remote.test.sh).
#
#   deploy-remote.sh          # deploys REVISION (default HEAD) of this repository
#
# Everything comes from the environment (the workflow maps the secrets of `production-<region>`; the table of secrets
# is in README.md, «Что сделать владельцу»). Optional, not secret: REGION (kz), SSH_PORT (22), SMTP_PORT (587),
# DEPLOY_DIR (/opt/lifeos), REVISION (HEAD), PROXY_HTTPS_PORT (443), PROXY_HTTP_PORT (80), MAIN_REF (origin/main).
# Only a commit from the history of MAIN_REF is deployed: the code of an unreviewed branch would get every secret.
# Secret values never reach the log: no tracing, and they travel to the server on SSH's stdin, not on a command line.
# On success the run summary (GITHUB_STEP_SUMMARY; stdout outside GitHub) gets the two public values the app's build
# needs: the API's public URL and the anon key. Nothing else from the server goes there.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib.sh"

REQUIRED_SECRETS=(SSH_HOST SSH_USER SSH_PRIVATE_KEY SSH_KNOWN_HOSTS DOMAIN SITE_URL SMTP_HOST SMTP_USER SMTP_PASS
  SMTP_ADMIN_EMAIL S3_ENDPOINT S3_REGION S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BACKUP_ENCRYPTION_KEY
  ALERT_WEBHOOK_URL)
# What provision.sh gets on stdin, besides the values derived below. One KEY=VALUE per line.
SERVER_SETTINGS=(SITE_URL SMTP_ADMIN_EMAIL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS S3_ENDPOINT S3_REGION S3_BUCKET
  AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BACKUP_ENCRYPTION_KEY ALERT_WEBHOOK_URL PROXY_HTTP_PORT PROXY_HTTPS_PORT)

REGION=${REGION:-kz}
SSH_PORT=${SSH_PORT:-22}
SMTP_PORT=${SMTP_PORT:-587}
DEPLOY_DIR=${DEPLOY_DIR:-/opt/lifeos}
PROXY_HTTPS_PORT=${PROXY_HTTPS_PORT:-443}
PROXY_HTTP_PORT=${PROXY_HTTP_PORT:-80}
MAIN_REF=${MAIN_REF:-origin/main}

# Stops before anything is touched when a secret is missing, naming all of them at once. The workflow checks the same
# list in its first step, before checkout; this is the guard for any other caller.
check_secrets() {
  local name missing=()
  for name in "${REQUIRED_SECRETS[@]}"; do [[ -n ${!name:-} ]] || missing+=("$name"); done
  if ((${#missing[@]} > 0)); then
    echo "::error title=Не заданы секреты окружения production-$REGION::${missing[*]} — что это и где взять: infra/supabase/README.md, «Что сделать владельцу»"
    die "не заданы секреты окружения production-$REGION (${#missing[@]}): ${missing[*]}"
  fi
  log "секреты окружения production-$REGION заданы (${#REQUIRED_SECRETS[@]})"
}

# Values must fit one line of the settings file, where they are written in single quotes (no expansion by Compose).
check_values() {
  local name value
  for name in "${SERVER_SETTINGS[@]}" DOMAIN SSH_HOST SSH_USER; do
    value=${!name}
    [[ $value != *[$'\n\r']* && $value != *"'"* ]] ||
      die "секрет $name: значение должно быть одной строкой без апострофа (')"
  done
  [[ $REGION =~ ^[a-z]{2}$ ]] || die "REGION должен быть двухбуквенным кодом, а не «$REGION»"
  [[ $DOMAIN =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] ||
    die "DOMAIN — только имя хоста API, без https:// и пути (например, api.example.kz)"
  [[ $DEPLOY_DIR =~ ^/[A-Za-z0-9._/-]+$ ]] || die "DEPLOY_DIR — абсолютный путь без пробелов, а не «$DEPLOY_DIR»"
  for name in SSH_PORT SMTP_PORT PROXY_HTTPS_PORT PROXY_HTTP_PORT; do
    [[ ${!name} =~ ^[1-9][0-9]*$ ]] || die "$name должен быть номером порта"
  done
  require_backup_key
}

settings() {
  local name public="https://$DOMAIN"
  [[ $PROXY_HTTPS_PORT == 443 ]] || public+=":$PROXY_HTTPS_PORT"
  printf '%s\n' "REGION=$REGION" "API_DOMAIN=$DOMAIN" "SUPABASE_PUBLIC_URL=$public" \
    "API_EXTERNAL_URL=$public/auth/v1" "ACME_EMAIL=$SMTP_ADMIN_EMAIL"
  # printf is a shell builtin: the values are not on any process's command line.
  for name in "${SERVER_SETTINGS[@]}"; do printf '%s=%s\n' "$name" "${!name}"; done
}

# Role claim of a JWT (anon, service_role…), read from its payload; empty when it is not a JWT.
jwt_role() {
  local payload=${1#*.}
  [[ $1 == *.*.* ]] || return 0
  payload=${payload%%.*}
  payload=$(tr '_-' '/+' <<< "$payload")
  while ((${#payload} % 4)); do payload+='='; done
  base64 -d <<< "$payload" 2> /dev/null | sed -nE 's/.*"role" *: *"([a-z_]+)".*/\1/p'
}

# report <sha> <stdout of provision.sh>: the public URL and the anon key, as the app's build variables
# (src/core/sync/config.ts), go to the run summary. Only a key whose role is anon gets there.
# shellcheck disable=SC2016 # backticks are Markdown here
report() {
  local sha=$1 line url='' anon='' suffix=${REGION^^}
  while IFS= read -r line; do
    case $line in
      SUPABASE_PUBLIC_URL=*) url=${line#*=} ;;
      ANON_KEY=*) anon=${line#*=} ;;
      '') ;;
      *) printf '%s\n' "$line" >&2 ;; # a revision before #295 printed its own lines: they belong to the log
    esac
  done <<< "$2"
  [[ $url =~ ^https://[a-z0-9.-]+(:[0-9]+)?$ ]] || url=''
  [[ $(jwt_role "$anon") == anon ]] || anon=''
  {
    printf '## Deploy KZ: регион %s, ревизия `%s`\n\n' "$REGION" "$sha"
    if [[ -n $url && -n $anon ]]; then
      printf '%s\n%s\n\n' 'Переменные сборки приложения. Оба значения публичные: адрес API и ключ `anon`' \
        '(`SERVICE_ROLE_KEY` и другие секреты сюда не попадают и в клиент не передаются).'
      printf '```\n%s\n%s\n```\n' "VITE_SUPABASE_URL_$suffix=$url" "VITE_SUPABASE_ANON_KEY_$suffix=$anon"
    else
      printf 'Сервер не вернул адрес API и ключ `anon` (ревизия до #295): возьмите `%s` и `%s` из `%s/%s.env`.\n' \
        SUPABASE_PUBLIC_URL ANON_KEY "$DEPLOY_DIR" "$REGION"
    fi
  } >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
  if [[ -n $url && -n $anon ]]; then
    log "регион $REGION: адрес API и ключ anon для сборки приложения — в итоге запуска"
  else
    log "регион $REGION: сервер не вернул адрес API и ключ anon — возьмите их из $DEPLOY_DIR/$REGION.env"
  fi
}

# shellcheck disable=SC2029,SC2153 # the command is built here on purpose; SSH_HOST comes from the environment
remote() { ssh "${ssh_args[@]}" "$SSH_USER@$SSH_HOST" "$@"; }

deploy() {
  check_secrets
  check_values

  local rev=${REVISION:-HEAD} sha
  sha=$(git -C "$here" rev-parse --verify --quiet "$rev^{commit}") || die "ревизия «$rev» не найдена"
  # Its provision.sh runs on the server with every secret: only reviewed code, i.e. a commit of main, gets there.
  git -C "$here" rev-parse --verify --quiet "$MAIN_REF^{commit}" > /dev/null ||
    die "нет $MAIN_REF: нужна история main (checkout с fetch-depth: 0)"
  git -C "$here" merge-base --is-ancestor "$sha" "$MAIN_REF" ||
    die "ревизия $sha не из истории $MAIN_REF: развёртываются только коммиты main (SHA или тег), не ветки на ревью"
  git -C "$here" cat-file -e "$sha:infra/supabase/provision.sh" 2> /dev/null ||
    die "в ревизии $sha нет infra/supabase/provision.sh: развёртывать (и откатывать) можно ревизии начиная с #284"

  ssh_dir=$(mktemp -d)
  trap 'rm -rf "$ssh_dir"' EXIT
  (
    umask 077
    tr -d '\r' <<< "$SSH_PRIVATE_KEY" > "$ssh_dir/key"
    tr -d '\r' <<< "$SSH_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
  )
  # The server's host key must be in SSH_KNOWN_HOSTS: an unknown or changed key stops the deploy.
  ssh_args=(-i "$ssh_dir/key" -p "$SSH_PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=20 -o ServerAliveInterval=30 -o LogLevel=ERROR)

  # The new code replaces the old as a whole, next to the settings file, which stays.
  log "регион $REGION: код ревизии $sha → $DEPLOY_DIR/app на сервере"
  git -C "$(git -C "$here" rev-parse --show-toplevel)" archive --format=tar "$sha" infra/supabase |
    remote "set -e; d=$DEPLOY_DIR; mkdir -p \$d; rm -rf \$d/app.new \$d/app.old; mkdir \$d/app.new
      tar -x -C \$d/app.new; echo $sha > \$d/app.new/REVISION
      if [ -d \$d/app ]; then mv \$d/app \$d/app.old; fi; mv \$d/app.new \$d/app; rm -rf \$d/app.old"

  local result
  result=$(settings | remote "$DEPLOY_DIR/app/infra/supabase/provision.sh $DEPLOY_DIR")
  log "регион $REGION: развёрнута ревизия $sha"
  report "$sha" "$result"
}

case ${1:-} in
  '') deploy ;;
  *)
    echo "usage: $0" >&2
    exit 2
    ;;
esac
