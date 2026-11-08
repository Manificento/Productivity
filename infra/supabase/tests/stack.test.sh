#!/usr/bin/env bash
# Infra checks of issue #172 for the stack itself: composition, deploy, two regions, health alerts.
# Needs Docker. Run: infra/supabase/tests/stack.test.sh
set -uo pipefail
. "$(dirname "$0")/lib.sh"

section 'docker-compose self-hosted Supabase без Realtime, Storage, imgproxy и Edge Runtime, env.example без секретов'
new_region kz 8000
use_region kz
services=$(compose --profile studio config --services | sort | tr '\n' ' ')
images=$(compose --profile studio config --images | tr '\n' ' ')
echo "  сервисы: $services"
check 'в стеке только db, auth, rest, kong (+ meta и studio по профилю)' \
  test "$services" == 'auth db kong meta rest studio '
check 'нет образов Realtime, Storage, imgproxy, Edge Runtime' \
  bash -c "! grep -qE 'realtime|storage-api|imgproxy|edge-runtime' <<< '$images'"
secret_lines=$(grep -E '^(POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY|PG_META_CRYPTO_KEY|SMTP_PASS|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ALERT_WEBHOOK_URL|BACKUP_ENCRYPTION_KEY)=' "$INFRA_DIR/env.example")
check 'в env.example все 10 секретов перечислены и пустые' \
  bash -c "[[ \$(wc -l <<< '$secret_lines') == 10 ]] && ! grep -qvE '=$' <<< '$secret_lines'"
check 'README с шагами разворота на VPS в РК' grep -q 'Разворот на VPS в Казахстане' "$INFRA_DIR/README.md"
check 'gen-env.sh заполняет секреты' grep -qE '^JWT_SECRET=[0-9a-f]{64}$' "$ENV_FILE"
check 'gen-env.sh создаёт ключ шифрования копий' grep -qE '^BACKUP_ENCRYPTION_KEY=[0-9a-f]{64}$' "$ENV_FILE"

section 'deploy.sh против локального Docker: стек поднимается, health и REST отвечают, Postgres только внутри сети Docker'
check 'deploy.sh завершается успешно' "$INFRA_DIR/deploy.sh"
check 'GET /auth/v1/health → 200' test "$(api_status /auth/v1/health "$ANON_KEY")" == 200
check 'GET /rest/v1/ с ключом service_role → 200' test "$(api_status /rest/v1/ "$SERVICE_ROLE_KEY")" == 200
check 'GET /rest/v1/ без ключа → 401' test "$(api_status /rest/v1/)" == 401
check 'GET /rest/v1/ (схема всех таблиц) с ключом anon → 403' test "$(api_status /rest/v1/ "$ANON_KEY")" == 403
db_id=$(compose ps -q db)
check 'у сервиса db нет опубликованных портов' \
  test "$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$db_id")" == '{}'
check 'порт 5432 на хосте закрыт' bash -c '! (exec 3<> /dev/tcp/127.0.0.1/5432) 2> /dev/null'
check 'Postgres отвечает внутри сети Docker' compose exec -T db pg_isready -h db -U postgres -q

section 'второй регион (eu) поднимается без изменений кода, только переменными среды'
new_region eu 8001
use_region eu
check 'deploy.sh с REGION=eu рядом с kz завершается успешно' "$INFRA_DIR/deploy.sh"
check 'регион eu: GET /auth/v1/health → 200' test "$(api_status /auth/v1/health "$ANON_KEY")" == 200
eu_anon=$ANON_KEY
use_region kz
check 'регион kz по-прежнему отвечает' test "$(api_status /auth/v1/health "$ANON_KEY")" == 200
check 'у регионов своя аутентификация: ключ eu не принимается в kz' \
  test "$(api_status /auth/v1/health "$eu_anon")" == 401
check 'у регионов отдельные базы (свои тома Docker)' \
  bash -c "docker volume ls -q | grep -qx lifeos-kz_db-data && docker volume ls -q | grep -qx lifeos-eu_db-data"

section 'контейнер упал или диск заполнен → healthcheck.sh шлёт уведомление в webhook (заглушка)'
hooks="$WORK/hooks.log"
: > "$hooks"
python3 -I "$TESTS_DIR/webhook-stub.py" 9199 "$hooks" &
stub_pid=$!
cleanups+=("kill $stub_pid")
sleep 1
export ALERT_WEBHOOK_URL=http://127.0.0.1:9199/alert HEALTH_STATE_FILE="$WORK/health-state" DISK_PATHS=/
alerts() { wc -l < "$hooks" | tr -d ' '; }

check 'здоровый стек: код 0, уведомлений нет' "$INFRA_DIR/healthcheck.sh"
check '…и webhook не вызывался' test "$(alerts)" == 0
compose stop rest > /dev/null 2>&1
check 'контейнер rest остановлен: код 1' bash -c "! '$INFRA_DIR/healthcheck.sh'"
check '…уведомление о контейнере rest отправлено' grep -q 'контейнер rest' "$hooks"
"$INFRA_DIR/healthcheck.sh" > /dev/null 2>&1
check '…повторная проверка с той же проблемой не шлёт дубль' test "$(alerts)" == 1
compose start rest > /dev/null 2>&1
compose up -d --wait > /dev/null 2>&1
check 'стек восстановлен: код 0' "$INFRA_DIR/healthcheck.sh"
check '…уведомление «снова в порядке» отправлено' grep -q 'снова в порядке' "$hooks"
check 'диск заполнен выше порога: код 1' bash -c "! DISK_ALERT_PERCENT=1 '$INFRA_DIR/healthcheck.sh'"
check '…уведомление о диске отправлено' grep -q 'диск / заполнен' "$hooks"

finish
