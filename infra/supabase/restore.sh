#!/usr/bin/env bash
# Restores a backup made by backup.sh into the region's freshly deployed, empty stack.
#
#   ENV_FILE=.env ./deploy.sh && ENV_FILE=.env ./restore.sh                  # the latest copy
#   ENV_FILE=.env ./restore.sh lifeos-kz-20261108T030000Z.sql.gz.enc         # a specific copy
#
# Refuses to run over data: the `public` schema must have no objects and `auth.users` no rows. The API (Kong, Auth,
# REST) is stopped while the copy loads in one transaction, so a failed restore leaves the database as it was.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
require_s3
require_backup_key

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
source_dir="s3://$S3_BUCKET/$(backup_prefix)"

name=${1:-}
if [[ -z $name ]]; then
  name=$(list_backups "$work" | tail -n 1)
  [[ -n $name ]] || die "в $source_dir/ нет копий региона $REGION"
fi
if [[ $name =~ $(legacy_backup_pattern) ]]; then
  die "«$name» — незашифрованная копия до #265: сначала ./migrate-backups.sh, затем ./restore.sh $name.enc"
fi
[[ $name =~ $(backup_pattern) ]] || die "«$name» не похоже на копию региона $REGION"

psql_admin() { compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

# Objects of the app schema (default privileges do not count) plus users: both must be zero.
existing=$(psql_admin -tA -c "select
  (select count(*) from pg_depend where refobjid = 'public'::regnamespace and classid <> 'pg_default_acl'::regclass)
  + (select count(*) from auth.users)")
[[ $existing == 0 ]] || die "стек не пустой (объектов в public и пользователей: $existing) — восстановление только на новый стек"

log "регион $REGION: скачиваю $name"
s3 "$work" s3 cp --only-show-errors "$source_dir/$name" "/work/$name"
if ! decrypt_backup < "$work/$name" > "$work/plain.sql.gz" 2> "$work/decrypt.err" ||
  ! gzip -t "$work/plain.sql.gz" 2>> "$work/decrypt.err"; then
  die "копию $name не расшифровать: другой BACKUP_ENCRYPTION_KEY или копия повреждена ($(tail -n 2 "$work/decrypt.err" | tr '\n' ' '))"
fi

# Kong goes too: no client writes during the restore, and it starts with fresh DNS for the restarted services.
compose stop kong auth rest
log "восстанавливаю в одной транзакции"
# The copy recreates `public` with its owner and privileges, so the empty one goes first.
if ! {
  echo 'DROP SCHEMA public CASCADE;'
  gunzip -c "$work/plain.sql.gz"
} | psql_admin -q --single-transaction -f - > /dev/null; then
  compose up -d --wait --wait-timeout "${DEPLOY_TIMEOUT:-300}" || true
  wait_for_api || true
  die "копия $name не загрузилась — транзакция отменена, база осталась пустой, API снова запущен"
fi
compose up -d --wait --wait-timeout "${DEPLOY_TIMEOUT:-300}"
wait_for_api

users=$(psql_admin -tA -c 'select count(*) from auth.users')
tables=$(psql_admin -tA -c "select count(*) from pg_tables where schemaname = 'public'")
log "регион $REGION: восстановлено из $name — пользователей $users, таблиц в public $tables"
