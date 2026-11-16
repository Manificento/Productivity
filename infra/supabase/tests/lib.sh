# shellcheck shell=bash
# Helpers for the infra tests (run by .github/workflows/infra.yml, or locally with Docker). Source it.
# Each test file deploys real stacks from generated env files in a temp dir and removes them (with volumes) on exit.

TESTS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
INFRA_DIR=$(cd "$TESTS_DIR/.." && pwd)
WORK=$(mktemp -d)
failures=0
cleanups=()

# shellcheck source=../lib.sh
. "$INFRA_DIR/lib.sh"

pass() { printf '  ✓ %s\n' "$1"; }
fail() {
  printf '  ✗ %s\n' "$1"
  failures=$((failures + 1))
}
# check "<name>" <command…>: runs the command, reports the name as passed or failed.
check() {
  local name=$1
  shift
  if "$@"; then pass "$name"; else fail "$name"; fi
}
section() { printf '\n%s\n' "$1"; }

on_exit() {
  local i
  for ((i = ${#cleanups[@]} - 1; i >= 0; i--)); do eval "${cleanups[i]}" > /dev/null 2>&1 || true; done
  rm -rf "$WORK"
}
trap on_exit EXIT

# new_region <region> <kong port> [KEY=VALUE…]: writes $WORK/<region>.env and registers the stack's removal.
new_region() {
  local region=$1 port=$2
  shift 2
  "$INFRA_DIR/gen-env.sh" REGION="$region" KONG_HTTP_PORT="$port" \
    SUPABASE_PUBLIC_URL="http://localhost:$port" API_EXTERNAL_URL="http://localhost:$port/auth/v1" "$@" \
    > "$WORK/$region.env"
  cleanups+=("ENV_FILE='$WORK/$region.env' REGION='$region' compose down -v --remove-orphans")
  ENV_FILE="$WORK/$region.env" REGION="$region" compose down -v --remove-orphans > /dev/null 2>&1 || true
}

# use_region <region>: makes lib.sh helpers (compose, api_status…) act on that region's stack.
use_region() {
  # load_env never overrides the environment, so the previous region's settings must go first.
  local key
  while read -r key; do unset "$key"; done < <(sed -nE 's/^([A-Z_][A-Z0-9_]*)=.*/\1/p' "$WORK"/*.env | sort -u)
  export ENV_FILE="$WORK/$1.env"
  load_env
}

# new_user <e-mail>: creates an account on a stack with ENABLE_EMAIL_AUTOCONFIRM=true and prints Auth's answer — a
# session: access_token, refresh_token, user. The request goes straight to Auth inside the Docker network: the
# gateway has no route that creates an account without a letter (kong.yml). Auth's sign-up insists on a password;
# the database does not keep it (migration 0002).
new_user() {
  compose exec -T auth wget -q -O - --header 'Content-Type: application/json' \
    --post-data "{\"email\":\"$1\",\"password\":\"$(openssl rand -hex 16)\"}" http://localhost:9999/signup
}

finish() {
  echo
  if ((failures > 0)); then
    echo "FAILED: $failures"
    exit 1
  fi
  echo "all infra checks passed"
}
