#!/usr/bin/env bash
# Backs up the region's database to S3-compatible storage and keeps the BACKUP_KEEP (default 14) newest copies.
# Unencrypted copies made before #265 are re-encrypted in place on the way (migrate_legacy_backups in lib.sh).
#
#   ENV_FILE=.env ./backup.sh          # daily from cron, see README
#
# The copy is `pg_dump` compressed with gzip and encrypted with BACKUP_ENCRYPTION_KEY (lib.sh): the app schema
# (`public`, structure and data), the data of `auth` (users, identities, sessions) and the app's triggers on tables
# of other schemas (the one on `auth.users` that creates a profile). Auth's own structure comes from GoTrue's
# migrations of the same image, so restore.sh loads a copy into a freshly deployed, empty stack. S3_* and AWS_* come
# from the environment or ENV_FILE.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env

work=$(mktemp -d)
# A failed nightly backup must not go unnoticed: any error alerts the webhook (if set) before the script exits.
on_exit() {
  local code=$?
  rm -rf "$work"
  if ((code != 0)) && [[ -z ${alerted:-} ]]; then
    notify "🔴 LifeOS [$REGION] $(hostname): резервная копия не создана (код $code), см. журнал backup.sh" || true
  fi
}
trap on_exit EXIT

require_s3
# Never upload a copy in the clear: no key, no backup (and an alert).
require_backup_key
keep=${BACKUP_KEEP:-14}
[[ $keep =~ ^[1-9][0-9]*$ ]] || die "BACKUP_KEEP должен быть положительным числом, а не «$keep»"
name="lifeos-$REGION-$(date -u +%Y%m%dT%H%M%SZ).sql.gz.enc"
target="s3://$S3_BUCKET/$(backup_prefix)"

# A trigger belongs to its table: `pg_dump --schema=public` leaves out a trigger of the app that sits on a table of
# another schema (migration 0002: `lifeos_create_profile` on `auth.users`), although its function is in the copy.
# Restored without it, the database would silently stop creating profiles: restore.sh also restores the journal of
# migrations, so migrate.sh would never run the migration again. This prints such triggers as SQL, each name
# qualified (the copy is loaded with an empty search_path).
outside_triggers() {
  compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -qtA << 'SQL'
set search_path = '';
select pg_catalog.pg_get_triggerdef(t.oid) || ';'
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and c.relnamespace <> 'public'::pg_catalog.regnamespace
  and p.pronamespace = 'public'::pg_catalog.regnamespace
order by c.relnamespace::pg_catalog.regnamespace::text, c.relname, t.tgname;
SQL
}

log "регион $REGION: pg_dump → $name"
{
  compose exec -T db pg_dump -U supabase_admin -d postgres --schema-only --schema=public
  # The data is loaded as it is: no trigger fires for a restored row.
  echo 'SET session_replication_role = replica;'
  compose exec -T db pg_dump -U supabase_admin -d postgres --data-only --schema=public --schema=auth \
    --exclude-table=auth.schema_migrations
  echo '-- Triggers of the app on tables of other schemas.'
  outside_triggers
} | gzip -9 | encrypt_backup > "$work/$name"
# The copy must decrypt with the same key before it is uploaded.
decrypt_backup < "$work/$name" | gzip -t
log "размер копии: $(du -h "$work/$name" | cut -f1)"

s3 "$work" s3 cp --only-show-errors "/work/$name" "$target/$name"
log "загружено в $target/$name"

# Copies made before #265 are re-encrypted in place, so none stays in the bucket in the clear (lib.sh).
legacy_left=0
migrate_legacy_backups "$work" || legacy_left=1

expired=$(list_backups "$work" | expired_backups "$keep")
for old in $expired; do
  s3 "$work" s3 rm --only-show-errors "$target/$old"
  log "удалена старая копия $old"
done
log "регион $REGION: хранится копий — $(list_backups "$work" | wc -l) (не больше $keep)"
if ((legacy_left)); then
  alerted=1
  notify "🟠 LifeOS [$REGION] $(hostname): копия создана, но в бакете остались незашифрованные старые копии — см. журнал backup.sh" || true
  exit 1
fi
