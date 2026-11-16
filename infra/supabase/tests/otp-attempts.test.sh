#!/usr/bin/env bash
# Infra check of issue #278 — the counter of sign-in attempts (plugin otp-attempts of Kong) under a flood of new
# addresses: a full memory zone must refuse a new address, never forget the attempts of another one. Filling the zone
# through the API takes more client addresses than a test has (the gateway limits attempts per client —
# account.test.sh), so the counter is run by itself: `resty` of the Kong image pinned in docker-compose.yml, with
# the zone exactly as docker-compose.yml declares it. No stack is started.
# Needs Docker. Run: infra/supabase/tests/otp-attempts.test.sh
set -uo pipefail
. "$(dirname "$0")/lib.sh"

# The least number of counters the zone holds — the number the docs name (README, ADR-0013, docker-compose.yml).
COUNTERS=250000

image=$(sed -nE 's/^ +image: (kong:[^ ]+)$/\1/p' "$INFRA_DIR/docker-compose.yml")
zone=$(sed -nE 's/^ +KONG_NGINX_HTTP_LUA_SHARED_DICT: (.+)$/\1/p' "$INFRA_DIR/docker-compose.yml")

section "счётчики попыток входа: предел на клиента и переполненная зона памяти (образ $image, зона «$zone»)"
check 'docker-compose.yml называет образ Kong и зону памяти счётчиков' test -n "$image" -a -n "$zone"
out=$(docker run --rm -v "$INFRA_DIR/volumes/api/plugins:/home/kong/plugins:ro" -v "$TESTS_DIR:/tests:ro" "$image" \
  resty --shdict "$zone" -I /home/kong/plugins /tests/otp-attempts.test.lua "$COUNTERS" 2>&1)
while IFS= read -r line; do
  case $line in
    'ok '*) pass "${line#ok }" ;;
    'not ok '*) fail "${line#not ok }" ;;
    'done '*) ;;
    *) echo "    $line" ;;
  esac
done <<< "$out"
# A script that stopped half-way reports no failure of its own.
check 'все 20 проверок выполнены' grep -qx 'done 20' <<< "$out"

finish
