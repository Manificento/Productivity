#!/usr/bin/env bash
# Applies the app's SQL migrations (migrations/NNNN_name.sql) that the region's database has not seen yet, in the
# order of their numbers. The stack must be running (deploy.sh).
#
#   ENV_FILE=.env ./migrate.sh
#
# Each file runs in ONE transaction together with its line in `public.lifeos_migrations`, so a failed migration
# leaves the database exactly as it was and the next run starts from the same file. A migration reads the region of
# the deployment as `current_setting('lifeos.region')`. Idempotent: a second run applies
# nothing. Migrations are append-only — never edit a file that has been applied anywhere; add the next number.
#
# They run as `postgres` (the owner of the app's objects on Supabase, not a superuser), so a SECURITY DEFINER
# function of a migration has that role's rights and no more.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env

MIGRATIONS_DIR=${MIGRATIONS_DIR:-$SUPABASE_DIR/migrations}
psql_owner() { compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# The journal lives in `public`, so backup.sh and restore.sh carry it together with the schema it describes.
# No API role may read or write it.
psql_owner << 'SQL'
create table if not exists public.lifeos_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.lifeos_migrations enable row level security;
revoke all on table public.lifeos_migrations from public, anon, authenticated, service_role;
SQL

# A database belongs to one region for good (ADR-0009, cells; migration 0002 records it in public.lifeos_cell): the
# profiles of its users and its backups carry that region. A copy restored into another region's stack stops here.
if [[ $(psql_owner -tA -c "select to_regclass('public.lifeos_cell') is not null") == t ]]; then
  cell=$(psql_owner -tA -c 'select region from public.lifeos_cell')
  [[ $cell == "$REGION" ]] ||
    die "эта база принадлежит региону «$cell», а в настройках REGION=$REGION — регион базы не меняется"
fi

applied=$(psql_owner -tA -c 'select name from public.lifeos_migrations')
count=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  [[ -e $file ]] || continue
  name=$(basename "$file")
  [[ $name =~ ^[0-9]{4}_[a-z0-9_]+\.sql$ ]] || die "«$name»: имя миграции — NNNN_name.sql (цифры, строчные буквы, _)"
  if grep -qxF "$name" <<< "$applied"; then continue; fi
  log "регион $REGION: миграция $name"
  {
    # The region of this deployment, for the migration that records it (load_env has checked its shape).
    printf "set local lifeos.region = '%s';\n" "$REGION"
    cat "$file"
    printf "\ninsert into public.lifeos_migrations (name) values ('%s');\n" "$name"
  } | psql_owner --single-transaction -f - ||
    die "миграция $name не применена — её транзакция отменена, база осталась прежней"
  count=$((count + 1))
done

# PostgREST learns about new tables and functions only when told.
psql_owner -c "notify pgrst, 'reload schema'"
log "регион $REGION: применено миграций — $count"
