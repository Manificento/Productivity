# shellcheck shell=bash
# Shared helpers for deploy.sh, backup.sh, restore.sh and healthcheck.sh. Source it, do not run it.
#
# Settings come from the process environment first, then from ENV_FILE (default: .env next to this file).
# One ENV_FILE = one region (cell): REGION=kz → Docker project `lifeos-kz`. A second region is a second env file.

SUPABASE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE=${ENV_FILE:-$SUPABASE_DIR/.env}
# The S3 client runs from an image, so the server needs nothing but Docker.
AWS_CLI_IMAGE=${AWS_CLI_IMAGE:-amazon/aws-cli:2.39.6}

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  log "ошибка: $*"
  exit 1
}

# Exports KEY=VALUE lines of ENV_FILE that are not already set in the environment. The file is parsed, never
# executed; surrounding single or double quotes are stripped.
load_env() {
  [[ -f $ENV_FILE ]] || die "нет файла настроек $ENV_FILE (создайте его: ./gen-env.sh > .env)"
  local line key value
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^[[:space:]]*(#|$) ]] && continue
    [[ $line =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key=${BASH_REMATCH[1]}
    value=${BASH_REMATCH[2]}
    if [[ $value =~ ^\"(.*)\"$ || $value =~ ^\'(.*)\'$ ]]; then value=${BASH_REMATCH[1]}; fi
    [[ -n ${!key+set} ]] || export "$key=$value"
  done < "$ENV_FILE"
  require REGION
  [[ $REGION =~ ^[a-z]{2}$ ]] || die "REGION должен быть двухбуквенным кодом (kz, eu…), а не «$REGION»"
}

# Fails with the names of the variables that are empty or unset.
require() {
  local name missing=()
  for name in "$@"; do [[ -n ${!name:-} ]] || missing+=("$name"); done
  ((${#missing[@]} == 0)) || die "не заданы переменные: ${missing[*]}"
}

compose() {
  docker compose --project-directory "$SUPABASE_DIR" -f "$SUPABASE_DIR/docker-compose.yml" \
    --env-file "$ENV_FILE" -p "lifeos-$REGION" "$@"
}

# The API gateway as seen from the server itself.
local_api_url() { echo "http://127.0.0.1:${KONG_HTTP_PORT:-8000}"; }

# HTTP status of GET <path> through the gateway with the given API key (empty key = no key).
api_status() {
  local path=$1 key=${2:-} args=(-s -o /dev/null -w '%{http_code}' -m 10)
  [[ -n $key ]] && args+=(-H "apikey: $key" -H "Authorization: Bearer $key")
  curl "${args[@]}" "$(local_api_url)$path" || true
}

# Waits until Auth and PostgREST answer 200 through Kong (up to a minute).
wait_for_api() {
  local auth rest
  for _ in $(seq 1 30); do
    auth=$(api_status /auth/v1/health "$ANON_KEY")
    rest=$(api_status /rest/v1/ "$SERVICE_ROLE_KEY")
    [[ $auth == 200 && $rest == 200 ]] && return 0
    sleep 2
  done
  die "API не отвечает: GET /auth/v1/health — $auth, GET /rest/v1/ — $rest (ожидалось 200)"
}

# Backups of a region live under s3://$S3_BUCKET/$S3_PREFIX/ (default prefix lifeos/<region>) — the bucket must be
# in the region's own jurisdiction (ADR-0009).
backup_prefix() { echo "${S3_PREFIX:-lifeos/$REGION}"; }
backup_pattern() { echo "^lifeos-$REGION-[0-9]{8}T[0-9]{6}Z\\.sql\\.gz\$"; }

require_s3() { require S3_ENDPOINT S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; }

# `s3 <local dir> <aws args…>`: the AWS CLI against any S3-compatible endpoint, <local dir> mounted at /work.
# Path-style addressing and checksums only when required work with MinIO, Yandex Object Storage and others.
s3() {
  local dir=$1
  shift
  docker run --rm --network host -v "$dir:/work" \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
    -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    -e AWS_CONFIG_FILE=/aws/config -v "$SUPABASE_DIR/volumes/s3/config:/aws/config:ro" \
    "$AWS_CLI_IMAGE" --endpoint-url "$S3_ENDPOINT" "$@"
}

# Names of this region's backups in the bucket, oldest first (the timestamp in the name sorts chronologically).
list_backups() {
  s3 "$1" s3 ls "s3://$S3_BUCKET/$(backup_prefix)/" | awk '{print $4}' | grep -E "$(backup_pattern)" | sort || true
}

# Prints the names to delete so that only the newest <keep> remain; reads names (any order) from stdin.
expired_backups() {
  local keep=$1
  sort | head -n "-$keep"
}
