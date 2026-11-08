#!/usr/bin/env bash
# Prints a ready env file for one region: env.example with overrides and fresh secrets.
#
#   ./gen-env.sh > .env                                   # region kz, defaults
#   ./gen-env.sh REGION=eu KONG_HTTP_PORT=8001 > .env.eu  # a second region on the same host
#
# Secrets left empty in env.example (POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, PG_META_CRYPTO_KEY,
# BACKUP_ENCRYPTION_KEY)
# are generated; ANON_KEY and SERVICE_ROLE_KEY are HS256 JWTs signed with JWT_SECRET, valid for 10 years.
set -euo pipefail
cd "$(dirname "$0")"

declare -A value=()
for arg in "$@"; do
  [[ $arg =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || {
    echo "usage: $0 [KEY=VALUE]..." >&2
    exit 2
  }
  value[${BASH_REMATCH[1]}]=${BASH_REMATCH[2]}
done

random_hex() { openssl rand -hex "$1"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() {
  local role=$1 secret=$2 now header payload signature
  now=$(date +%s)
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$role" "$now" $((now + 10 * 365 * 24 * 3600)) | b64url)
  signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

: "${value[POSTGRES_PASSWORD]:=$(random_hex 24)}"
: "${value[JWT_SECRET]:=$(random_hex 32)}"
: "${value[PG_META_CRYPTO_KEY]:=$(random_hex 32)}"
: "${value[BACKUP_ENCRYPTION_KEY]:=$(random_hex 32)}"
: "${value[ANON_KEY]:=$(jwt anon "${value[JWT_SECRET]}")}"
: "${value[SERVICE_ROLE_KEY]:=$(jwt service_role "${value[JWT_SECRET]}")}"

declare -A seen=()
while IFS= read -r line || [[ -n $line ]]; do
  if [[ $line =~ ^([A-Z_][A-Z0-9_]*)= ]]; then
    key=${BASH_REMATCH[1]}
    seen[$key]=1
    [[ -n ${value[$key]+set} ]] && line="$key=${value[$key]}"
  fi
  printf '%s\n' "$line"
done < env.example

# Overrides of keys that env.example does not list go at the end.
for key in "${!value[@]}"; do
  [[ -n ${seen[$key]+set} ]] || printf '%s=%s\n' "$key" "${value[$key]}"
done
