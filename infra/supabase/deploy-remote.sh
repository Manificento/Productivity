#!/usr/bin/env bash
# Deploys one region to its own server over SSH (#284): uploads the code of a revision, then provision.sh on the server
# builds the settings file from the secrets, runs deploy.sh with the HTTPS reverse proxy, installs the cron schedule
# and checks the API by HTTPS. Run by the «Deploy KZ» workflow; the Infra workflow runs the same script against a test
# server (tests/deploy-remote.test.sh).
#
#   deploy-remote.sh check    # only checks that every secret is set: the first step of the workflow
#   deploy-remote.sh          # deploys REVISION (default HEAD) of this repository
#
# Everything comes from the environment (the workflow maps the secrets of `production-<region>`; the table of secrets
# is in README.md, «Что сделать владельцу»). Optional, not secret: REGION (kz), SSH_PORT (22), SMTP_PORT (587),
# DEPLOY_DIR (/opt/lifeos), REVISION (HEAD), PROXY_HTTPS_PORT (443), PROXY_HTTP_PORT (80).
# Secret values never reach the log: no tracing, and they travel to the server on SSH's stdin, not on a command line.
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

# Stops before anything is touched when a secret is missing, naming all of them at once.
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

# shellcheck disable=SC2029,SC2153 # the command is built here on purpose; SSH_HOST comes from the environment
remote() { ssh "${ssh_args[@]}" "$SSH_USER@$SSH_HOST" "$@"; }

deploy() {
  check_secrets
  check_values

  local rev=${REVISION:-HEAD} sha
  sha=$(git -C "$here" rev-parse --verify --quiet "$rev^{commit}" ||
    git -C "$here" rev-parse --verify --quiet "origin/$rev^{commit}") || die "ревизия «$rev» не найдена"
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

  settings | remote "$DEPLOY_DIR/app/infra/supabase/provision.sh $DEPLOY_DIR"
  log "регион $REGION: развёрнута ревизия $sha"
}

case ${1:-} in
  check) check_secrets ;;
  '') deploy ;;
  *)
    echo "usage: $0 [check]" >&2
    exit 2
    ;;
esac
