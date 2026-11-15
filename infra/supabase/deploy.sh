#!/usr/bin/env bash
# Starts (or updates) the region's stack and checks it: Auth and REST answer through Kong, Postgres is not published.
#
#   ENV_FILE=.env ./deploy.sh
#
# Idempotent: re-running pulls the pinned images and recreates only the containers whose config changed — a changed
# kong.yml or Caddyfile counts too (lib.sh, `compose`).
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
require POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY PG_META_CRYPTO_KEY SUPABASE_PUBLIC_URL API_EXTERNAL_URL SITE_URL

log "регион $REGION: запуск стека lifeos-$REGION"
[[ ${SKIP_PULL:-} == 1 ]] || compose pull --quiet
compose up -d --wait --wait-timeout "${DEPLOY_TIMEOUT:-300}"

wait_for_api
log "GET /auth/v1/health и GET /rest/v1/ — 200"

# Postgres must stay inside the Docker network: no host port may be published for the db service.
bindings=$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$(compose ps -q db)")
[[ $bindings == '{}' ]] || die "порт Postgres опубликован наружу ($bindings) — уберите ports у сервиса db"
log "Postgres доступен только внутри сети Docker"
log "регион $REGION: стек работает на $(local_api_url)"
