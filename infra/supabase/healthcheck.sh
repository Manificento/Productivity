#!/usr/bin/env bash
# Checks the region's stack and alerts ALERT_WEBHOOK_URL when something is wrong. Run from cron every 5 minutes.
#
#   ENV_FILE=.env ./healthcheck.sh
#
# Problems: a service of the stack is missing, stopped or unhealthy; Auth does not answer through Kong; a disk with
# one of DISK_PATHS is at least DISK_ALERT_PERCENT full. The webhook gets POST {"text": "…"} when the set of problems
# changes (not every 5 minutes while it stays the same) and once more when everything is back to normal.
# Exit code: 0 healthy, 1 problems found.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
threshold=${DISK_ALERT_PERCENT:-85}
state_file=${HEALTH_STATE_FILE:-${XDG_STATE_HOME:-$HOME/.local/state}/lifeos/health-$REGION}

problems=()

# Every service of the default profile must be running and not unhealthy.
declare -A seen=()
while read -r service state health; do
  [[ -z $service ]] && continue
  seen[$service]=1
  if [[ $state != running ]]; then
    problems+=("контейнер $service: $state")
  elif [[ $health == unhealthy ]]; then
    problems+=("контейнер $service: unhealthy")
  fi
done < <(compose ps -a --format '{{.Service}} {{.State}} {{.Health}}' 2> /dev/null || true)
while read -r service; do
  [[ -z $service || -n ${seen[$service]+set} ]] || problems+=("контейнер $service: не создан")
done < <(compose config --services)

if [[ -n ${ANON_KEY:-} ]]; then
  status=$(api_status /auth/v1/health "$ANON_KEY")
  [[ $status == 200 ]] || problems+=("GET /auth/v1/health: ответ ${status:-нет}")
fi

for path in ${DISK_PATHS:-/}; do
  [[ -e $path ]] || continue
  used=$(df -P "$path" | awk 'NR == 2 { sub("%", "", $5); print $5 }')
  ((used >= threshold)) && problems+=("диск $path заполнен на $used% (порог $threshold%)")
done

json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

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

current=''
((${#problems[@]} > 0)) && current=$(printf '%s\n' "${problems[@]}")
previous=$(cat "$state_file" 2> /dev/null || true)
host=$(hostname)

if [[ $current != "$previous" ]]; then
  if [[ -n $current ]]; then
    message="🔴 LifeOS [$REGION] $host: проблемы со стеком"$'\n'"$(printf -- '- %s\n' "${problems[@]}")"
  else
    message="🟢 LifeOS [$REGION] $host: стек снова в порядке"
  fi
  # The state advances only when the alert went out, so a failed delivery is retried on the next run.
  if notify "$message"; then
    mkdir -p "$(dirname "$state_file")"
    printf '%s' "$current" > "$state_file"
  fi
fi

if [[ -n $current ]]; then
  log "регион $REGION: проблем — ${#problems[@]}"
  exit 1
fi
log "регион $REGION: всё в порядке"
