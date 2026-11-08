#!/usr/bin/env bash
# Infra checks of issue #172 for backups: backup.sh to S3 (a local MinIO container), 14 newest copies kept,
# restore.sh of the latest copy on an empty stack brings back synthetic users and data.
# Needs Docker. Run: infra/supabase/tests/backup-restore.test.sh
set -uo pipefail
. "$(dirname "$0")/lib.sh"

# MinIO's own images left Docker Hub in 2025; pgsty/minio is the maintained build of the same server.
MINIO_IMAGE=pgsty/minio:RELEASE.2026-08-04T00-00-00Z
EMAIL=synthetic-user@example.com
PASSWORD=synthetic-password-1

section 'подготовка: стек kz с синтетическими данными, MinIO с бакетом'
new_region kz 8000 ENABLE_EMAIL_AUTOCONFIRM=true
use_region kz
"$INFRA_DIR/deploy.sh" || exit 1
api=$(local_api_url)

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
# Prints the access token, or nothing; the last response stays in $WORK/login.json for the failure report.
login() {
  json_post '/auth/v1/token?grant_type=password' "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > "$WORK/login.json"
  jq -r '.access_token // empty' "$WORK/login.json" 2> /dev/null
}
notes() { curl -s -m 10 "$api/rest/v1/synthetic_notes?select=body&order=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer ${1:-$ANON_KEY}" | jq -r 'map(.body) | join(",")'; }

json_post /auth/v1/signup "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null
token=$(login)
sleep 1
for body in первая вторая третья; do
  json_post /rest/v1/synthetic_notes "{\"body\":\"$body\"}" -H "Authorization: Bearer $token" > /dev/null
done
check 'синтетический пользователь видит свои 3 заметки' test "$(notes "$token")" == 'первая,вторая,третья'

section 'backup.sh: pg_dump сжат и загружен в S3 (MinIO), хранятся 14 последних копий'
# 15 older copies already in the bucket: after one more backup the two oldest must go.
echo old > "$WORK/old.sql.gz"
for day in $(seq -w 1 15); do
  s3 "$WORK" s3 cp --only-show-errors /work/old.sql.gz "s3://$S3_BUCKET/lifeos/kz/lifeos-kz-202601${day}T030000Z.sql.gz"
done
check 'backup.sh завершается успешно' "$INFRA_DIR/backup.sh"
mapfile -t kept < <(list_backups "$WORK")
newest=${kept[-1]:-}
check 'в бакете 14 копий' test "${#kept[@]}" == 14
check 'самая новая — только что сделанная (сегодняшняя дата)' bash -c "[[ '$newest' == lifeos-kz-$(date -u +%Y%m%d)T* ]]"
check 'две самые старые удалены' bash -c "[[ '${kept[0]}' == lifeos-kz-20260103T030000Z.sql.gz ]]"
s3 "$WORK" s3 cp --only-show-errors "s3://$S3_BUCKET/lifeos/kz/$newest" "/work/$newest"
check 'копия — gzip' gzip -t "$WORK/$newest"
check 'внутри — pg_dump с данными auth и public' \
  bash -c "gunzip -c '$WORK/$newest' | grep -q 'COPY auth.users' && gunzip -c '$WORK/$newest' | grep -q 'COPY public.synthetic_notes'"

section 'restore.sh последней копии на пустом стеке восстанавливает синтетические данные'
check 'restore.sh отказывается писать поверх данных' bash -c "! '$INFRA_DIR/restore.sh' 2> /dev/null"
compose down -v > /dev/null 2>&1
SKIP_PULL=1 "$INFRA_DIR/deploy.sh" > /dev/null 2>&1
check 'новый стек пуст: пользователь не входит' test -z "$(login)"
check 'restore.sh завершается успешно' "$INFRA_DIR/restore.sh"
token=$(login)
check 'пользователь снова входит со старым паролем' test -n "$token"
[[ -n $token ]] || echo "    ответ: $(tr -d '\n' < "$WORK/login.json")"
check 'его 3 заметки на месте' test "$(notes "$token")" == 'первая,вторая,третья'
check 'RLS работает: без входа заметок не видно' test -z "$(notes)"
status=$(json_post /rest/v1/synthetic_notes '{"body":"после восстановления"}' -H "Authorization: Bearer $token" -o /dev/null -w '%{http_code}')
check 'новые записи после восстановления сохраняются' test "$status" == 201

finish
