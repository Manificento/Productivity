#!/usr/bin/env bash
# Backs up the region's database to S3-compatible storage and keeps the BACKUP_KEEP (default 14) newest copies.
#
#   ENV_FILE=.env ./backup.sh          # daily from cron, see README
#
# The copy is `pg_dump` compressed with gzip: the app schema (`public`, structure and data) plus the data of
# `auth` (users, identities, sessions). Auth's own structure comes from GoTrue's migrations of the same image, so
# restore.sh loads a copy into a freshly deployed, empty stack. S3_* and AWS_* come from the environment or ENV_FILE.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
require_s3
keep=${BACKUP_KEEP:-14}
[[ $keep =~ ^[1-9][0-9]*$ ]] || die "BACKUP_KEEP должен быть положительным числом, а не «$keep»"

work=$(mktemp -d)
# A failed nightly backup must not go unnoticed: any error alerts the webhook (if set) before the script exits.
on_exit() {
  local code=$?
  rm -rf "$work"
  if ((code != 0)); then
    notify "🔴 LifeOS [$REGION] $(hostname): резервная копия не создана (код $code), см. журнал backup.sh" || true
  fi
}
trap on_exit EXIT
name="lifeos-$REGION-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
target="s3://$S3_BUCKET/$(backup_prefix)"

log "регион $REGION: pg_dump → $name"
# shellcheck disable=SC2016 # expanded inside the db container
compose exec -T db bash -c 'set -euo pipefail
  pg_dump -U supabase_admin -d postgres --schema-only --schema=public
  echo "SET session_replication_role = replica;"
  pg_dump -U supabase_admin -d postgres --data-only --schema=public --schema=auth \
    --exclude-table=auth.schema_migrations' | gzip -9 > "$work/$name"
gzip -t "$work/$name"
log "размер копии: $(du -h "$work/$name" | cut -f1)"

s3 "$work" s3 cp --only-show-errors "/work/$name" "$target/$name"
log "загружено в $target/$name"

expired=$(list_backups "$work" | expired_backups "$keep")
for old in $expired; do
  s3 "$work" s3 rm --only-show-errors "$target/$old"
  log "удалена старая копия $old"
done
log "регион $REGION: хранится копий — $(list_backups "$work" | wc -l) (не больше $keep)"
