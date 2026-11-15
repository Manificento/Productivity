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

# read_env_file <file> <name of an associative array>: puts the file's KEY=VALUE lines into the array. The file is
# parsed, never executed; surrounding single or double quotes are stripped.
read_env_file() {
  local -n env_values=$2
  local line key value
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^[[:space:]]*(#|$) ]] && continue
    [[ $line =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key=${BASH_REMATCH[1]}
    value=${BASH_REMATCH[2]}
    if [[ $value =~ ^\"(.*)\"$ || $value =~ ^\'(.*)\'$ ]]; then value=${BASH_REMATCH[1]}; fi
    # shellcheck disable=SC2034 # env_values is the caller's array (nameref)
    env_values["$key"]=$value
  done < "$1"
}

# Exports the settings of ENV_FILE that are not already set in the environment.
load_env() {
  [[ -f $ENV_FILE ]] || die "нет файла настроек $ENV_FILE (создайте его: ./gen-env.sh > .env)"
  local -A settings=()
  local key
  read_env_file "$ENV_FILE" settings
  for key in "${!settings[@]}"; do
    [[ -n ${!key+set} ]] || export "$key=${settings[$key]}"
  done
  require REGION
  [[ $REGION =~ ^[a-z]{2}$ ]] || die "REGION должен быть двухбуквенным кодом (kz, eu…), а не «$REGION»"
}

# Fails with the names of the variables that are empty or unset.
require() {
  local name missing=()
  for name in "$@"; do [[ -n ${!name:-} ]] || missing+=("$name"); done
  ((${#missing[@]} == 0)) || die "не заданы переменные: ${missing[*]}"
}

# A container that reads a config file mounted from the code (kong.yml, Caddyfile) carries the file's sha256 as a label
# (docker-compose.yml): a new revision with a changed file is a changed service, so `up` recreates that container and
# leaves the others. The init SQL of db is not hashed on purpose: it acts only on an empty database (provision.sh).
compose() {
  KONG_CONFIG_SHA256=$(sha256sum < "$SUPABASE_DIR/volumes/api/kong.yml" | cut -d' ' -f1) \
    PROXY_CONFIG_SHA256=$(sha256sum < "$SUPABASE_DIR/volumes/proxy/Caddyfile" | cut -d' ' -f1) \
    docker compose --project-directory "$SUPABASE_DIR" -f "$SUPABASE_DIR/docker-compose.yml" \
    --env-file "$ENV_FILE" -p "lifeos-$REGION" "$@"
}

# The API gateway as seen from the server itself.
local_api_url() { echo "http://127.0.0.1:${KONG_HTTP_PORT:-8000}"; }

# HTTP status of GET <url> with the given API key (empty key = no key); more curl options (--cacert …) may follow.
# The key goes to curl as a header file (printf is a builtin), not on its command line, where `ps` would show it.
http_status() {
  local url=$1 key=${2:-} args=(-s -o /dev/null -w '%{http_code}' -m 10 "${@:3}")
  if [[ -n $key ]]; then
    curl "${args[@]}" -H @<(printf 'apikey: %s\nAuthorization: Bearer %s\n' "$key" "$key") "$url" || true
  else
    curl "${args[@]}" "$url" || true
  fi
}

# HTTP status of GET <path> through the gateway, as seen from the server itself.
api_status() { http_status "$(local_api_url)$1" "${2:-}"; }

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
backup_pattern() { echo "^lifeos-$REGION-[0-9]{8}T[0-9]{6}Z\\.sql\\.gz\\.enc\$"; }

# Copies are encrypted before they leave the server (#265): AES-256 with a key derived by PBKDF2 from
# BACKUP_ENCRYPTION_KEY (random, from gen-env.sh). Without the key no copy can be read, so it is kept in the password
# manager apart from the bucket keys — a leak of the bucket alone discloses nothing.
BACKUP_CIPHER=(-aes-256-cbc -pbkdf2 -iter 200000 -md sha256)
require_backup_key() {
  require BACKUP_ENCRYPTION_KEY
  ((${#BACKUP_ENCRYPTION_KEY} >= 32)) || die "BACKUP_ENCRYPTION_KEY короче 32 символов — создайте новый: openssl rand -hex 32"
}
# stdin → stdout; the key is read from the environment, never from the command line (visible in `ps`).
encrypt_backup() { openssl enc -e "${BACKUP_CIPHER[@]}" -salt -pass env:BACKUP_ENCRYPTION_KEY; }
decrypt_backup() { openssl enc -d "${BACKUP_CIPHER[@]}" -pass env:BACKUP_ENCRYPTION_KEY; }

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

# Alerts: POST {"text": "…"} to ALERT_WEBHOOK_URL (Slack/Mattermost webhook, Telegram sendMessage…).
json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# notify <text>: logs the text and sends it; fails when the webhook is not set or does not accept it.
notify() {
  local text=$1
  log "$text"
  if [[ -z ${ALERT_WEBHOOK_URL:-} ]]; then
    log "ALERT_WEBHOOK_URL не задан — уведомление не отправлено"
    return 1
  fi
  curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
    --data "{\"text\": \"$(json_escape "$text")\"}" "$ALERT_WEBHOOK_URL" > /dev/null
}

# Names of all objects under this region's prefix. An S3 error (credentials, network) fails the call; only an empty
# prefix gives an empty list.
list_objects() {
  local listing
  listing=$(s3 "$1" s3 ls "s3://$S3_BUCKET/$(backup_prefix)/") || {
    # `aws s3 ls` exits 1 for a prefix with no objects; any other failure is real.
    [[ $? == 1 && -z $listing ]] || die "не удалось получить список копий в s3://$S3_BUCKET/$(backup_prefix)/"
  }
  awk 'NF >= 4 {print $4}' <<< "$listing"
}

# Names of this region's backups in the bucket, oldest first (the timestamp in the name sorts chronologically).
list_backups() {
  local names
  names=$(list_objects "$1") || exit 1
  { grep -E "$(backup_pattern)" <<< "$names" || true; } | sort
}

# Copies made before #265 were uploaded unencrypted: lifeos-<region>-<time>.sql.gz.
legacy_backup_pattern() { echo "^lifeos-$REGION-[0-9]{8}T[0-9]{6}Z\\.sql\\.gz\$"; }

# Re-encrypts those copies in place: <name>.enc is uploaded once it decrypts back to the same bytes, and only then
# the plaintext object is deleted. The timestamp stays in the name, so restore points and pruning are kept. Safe to
# rerun. A copy that is not valid gzip is left untouched. Returns 1 if any copy is still in the clear (logged).
migrate_legacy_backups() {
  local dir=$1 target names name legacy failed=0
  target="s3://$S3_BUCKET/$(backup_prefix)"
  names=$(list_objects "$dir") || return 1
  mapfile -t legacy < <(grep -E "$(legacy_backup_pattern)" <<< "$names")
  for name in "${legacy[@]}"; do
    if ! s3 "$dir" s3 cp --only-show-errors "$target/$name" "/work/$name"; then
      log "старую копию $name не скачать — осталась в бакете в открытом виде"
      failed=1
    elif ! gzip -t "$dir/$name" 2> /dev/null; then
      log "старая копия $name повреждена (не gzip) и осталась в бакете в открытом виде — проверьте и удалите её вручную"
      failed=1
    elif encrypt_backup < "$dir/$name" > "$dir/$name.enc" &&
      decrypt_backup < "$dir/$name.enc" | cmp -s - "$dir/$name" &&
      s3 "$dir" s3 cp --only-show-errors "/work/$name.enc" "$target/$name.enc" &&
      s3 "$dir" s3 rm --only-show-errors "$target/$name"; then
      log "старая копия $name зашифрована → $name.enc, открытая удалена"
    else
      log "старую копию $name не зашифровать — осталась в бакете в открытом виде"
      failed=1
    fi
    rm -f "$dir/$name" "$dir/$name.enc"
  done
  return "$failed"
}

# Prints the names to delete so that only the newest <keep> remain; reads names (any order) from stdin.
expired_backups() {
  local keep=$1
  sort | head -n "-$keep"
}
