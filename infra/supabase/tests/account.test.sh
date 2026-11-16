#!/usr/bin/env bash
# Infra checks of issue #278 — the account, against a real stack: sign-in by e-mail (one letter with a six-digit
# code and a link, read from the mail trap — no real mail is sent), the session, profiles with the region, the
# append-only consent journal with row level security on two users, the age rule on the server, delete_account().
# Needs Docker, jq and openssl. Run: infra/supabase/tests/account.test.sh
set -uo pipefail
. "$(dirname "$0")/lib.sh"

SITE=http://localhost:5173
MAIL_TRAP_PORT=${MAIL_TRAP_PORT:-8025}

# same "<name>" <actual> <expected>: like check, and shows both values when they differ.
same() {
  if [[ $2 == "$3" ]]; then pass "$1"; else fail "$1 (получено «$2», ожидалось «$3»)"; fi
}

section 'подготовка: пустой стек kz с почтовой ловушкой (профиль test), миграции'
# Users are NOT confirmed automatically here: the only way in is the code or the link of the letter.
new_region kz 8000 COMPOSE_PROFILES=test MAIL_TRAP_PORT="$MAIL_TRAP_PORT" SITE_URL="$SITE" \
  SMTP_HOST=mail SMTP_PORT=1025 SMTP_ADMIN_EMAIL=noreply@lifeos.test SMTP_MAX_FREQUENCY=1s
use_region kz
"$INFRA_DIR/deploy.sh" || exit 1
"$INFRA_DIR/migrate.sh" || exit 1
api=$(local_api_url)
trap_api=http://127.0.0.1:$MAIL_TRAP_PORT/api/v1

sql() { compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
# as_user <user id> <sql>: runs the SQL the way PostgREST does for that user. Prints the result or the error.
as_user() {
  sql -q -c 'set role authenticated' \
    -c "set \"request.jwt.claims\" = '{\"sub\":\"$1\",\"role\":\"authenticated\"}'" -c "$2" 2>&1
}
# call <token or ''> <method> <path> [json]: prints the HTTP status, leaves the response in $WORK/body.json.
call() {
  local token=$1 method=$2 path=$3 json=${4:-}
  local args=(-s -m 20 -o "$WORK/body.json" -w '%{http_code}' -X "$method" "$api$path" -H "apikey: $ANON_KEY"
    -H 'Prefer: return=representation')
  [[ -n $token ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n $json ]] && args+=(-H 'Content-Type: application/json' -d "$json")
  curl "${args[@]}" || true
}
# body [jq filter]: the last response, compact. field <jq filter>: one value of it, raw.
body() { jq -c "${1:-.}" "$WORK/body.json" 2> /dev/null; }
field() { jq -r "$1" "$WORK/body.json" 2> /dev/null; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# PKCE, as src/core/account/pkce.ts does it: the device keeps the verifier, the server gets its SHA-256.
new_verifier() { openssl rand 32 | b64url; }
challenge_of() { printf '%s' "$1" | openssl dgst -sha256 -binary | b64url; }
# request_letter <email> <verifier>: what requestSignIn() sends. Prints the HTTP status.
request_letter() {
  call '' POST /auth/v1/otp \
    "{\"email\":\"$1\",\"create_user\":true,\"code_challenge\":\"$(challenge_of "$2")\",\"code_challenge_method\":\"s256\"}"
}
# letters_to <email>: how many letters the trap holds for the address.
letters_to() { curl -s -m 10 "$trap_api/search?query=to:$1" | jq -r '.messages_count'; }
# wait_letters <email> <count>: waits until the trap holds that many letters for the address.
wait_letters() {
  for _ in $(seq 1 20); do
    [[ $(letters_to "$1") == "$2" ]] && return 0
    sleep 0.5
  done
  return 1
}
# last_letter <email>: saves the newest letter to the address as $WORK/letter.html (its HTML part).
last_letter() {
  local id
  id=$(curl -s -m 10 "$trap_api/search?query=to:$1" | jq -r '.messages[0].ID')
  curl -s -m 10 "$trap_api/message/$id" | jq -r '.HTML' > "$WORK/letter.html"
}
letter_codes() { grep -oE '>[0-9]{6}<' "$WORK/letter.html" | tr -d '<>' | sort -u; }
letter_link() {
  grep -oE 'href="[^"]+"' "$WORK/letter.html" | head -n 1 | sed -e 's/^href="//' -e 's/"$//' -e 's/&amp;/\&/g'
}
# verify_code <email> <code>: what completeSignIn({ code }) sends. Prints the HTTP status.
verify_code() { call '' POST /auth/v1/verify "{\"type\":\"email\",\"email\":\"$1\",\"token\":\"$2\"}"; }
# exchange <link code> <verifier>: what completeSignIn({ linkCode }) sends. Prints the HTTP status.
exchange() { call '' POST '/auth/v1/token?grant_type=pkce' "{\"auth_code\":\"$1\",\"code_verifier\":\"$2\"}"; }
refresh() { call '' POST '/auth/v1/token?grant_type=refresh_token' "{\"refresh_token\":\"$1\"}"; }
# consent <token> <kind> <granted> [details json]: adds a row to the journal. Prints the HTTP status.
consent() {
  call "$1" POST /rest/v1/consents \
    "{\"kind\":\"$2\",\"granted\":$3,\"text_version\":\"2026-11\",\"details\":${4:-null}}"
}
push() { call "$1" POST /rest/v1/rpc/sync_push "{\"changes\":$2,\"since\":0}"; }
task() { echo "{\"table\":\"tasks\",\"key\":\"$1\",\"updatedAt\":1000,\"updatedBy\":\"dev\",\"data\":{\"title\":\"$1\"}}"; }
# journal <user id>: the user's journal as the database holds it, oldest first: "kind=granted …".
journal() {
  sql -c "select coalesce(string_agg(kind || '=' || granted, ' ' order by id), '') from public.consents where user_id = '$1'"
}

section 'вход только по email: Google OAuth и другие внешние провайдеры выключены'
same 'GET /auth/v1/settings: из способов входа включён только email' \
  "$(call '' GET /auth/v1/settings && body '[.external | to_entries[] | select(.value) | .key]')" '200["email"]'
same '…анонимные пользователи и вход по телефону выключены' \
  "$(body '[.external.anonymous_users, .external.phone, .external.google, .external.apple]')" '[false,false,false,false]'
same 'вход через Google не начинается: /auth/v1/authorize?provider=google → 400' \
  "$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$api/auth/v1/authorize?provider=google")" 400
same '…и через Apple' \
  "$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$api/auth/v1/authorize?provider=apple")" 400

section 'requestSignIn: сервер Auth шлёт одно письмо со ссылкой и шестизначным кодом'
check 'шаблон письма Auth получает от Kong внутри сети Docker' grep -q '{{ .Token }}' \
  <<< "$(compose exec -T auth wget -q -O - http://kong:8088/mail/sign-in.html)"
same '…снаружи порт шаблонов не опубликован: у Kong опубликован только порт API' \
  "$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$(compose ps -q kong)" | jq -c keys)" '["8000/tcp"]'
same '…и маршрута к шаблонам в API нет' "$(call '' GET /mail/sign-in.html)" 404
anna_verifier=$(new_verifier)
same 'новый адрес: POST /auth/v1/otp → 200' "$(request_letter anna@example.com "$anna_verifier")" 200
check 'письмо пришло в почтовую ловушку' wait_letters anna@example.com 1
sleep 1
same '…ровно одно' "$(letters_to anna@example.com)" 1
last_letter anna@example.com
anna_code=$(letter_codes)
check '…в письме шестизначный код (один и тот же во всех местах письма)' grep -qxE '[0-9]{6}' <<< "$anna_code"
check '…и ссылка на /auth/v1/verify этого региона, которая вернёт пользователя в приложение' \
  grep -qE "^http://localhost:8000/auth/v1/verify\?token=pkce_[0-9a-f]+&type=signup&redirect_to=$SITE\$" <<< "$(letter_link)"
check '…письмо из нашего шаблона, на русском' grep -q 'Код для входа' "$WORK/letter.html"
same 'до ввода кода пользователь не вошёл: сессий нет' "$(sql -c 'select count(*) from auth.sessions')" 0

section 'completeSignIn: код из письма'
same 'неверный код → 403' "$(verify_code anna@example.com 000000)" 403
same 'код из письма → 200 и сессия' "$(verify_code anna@example.com "$anna_code")" 200
same '…ответ — то, что читает клиент: токены, срок, пользователь' \
  "$(body '[(.access_token | type), (.refresh_token | type), .expires_in, .user.email]')" \
  '["string","string",3600,"anna@example.com"]'
anna=$(field '.access_token')
anna_refresh=$(field '.refresh_token')
anna_id=$(field '.user.id')
same 'код одноразовый: второй раз → 403' "$(verify_code anna@example.com "$anna_code")" 403

section 'completeSignIn: параметр ?code= из ссылки (до #, совместимо с HashRouter)'
boris_verifier=$(new_verifier)
request_letter boris@example.com "$boris_verifier" > /dev/null
check 'письмо Борису пришло' wait_letters boris@example.com 1
last_letter boris@example.com
redirect=$(curl -s -m 10 -o /dev/null -w '%{redirect_url}' "$(letter_link)")
check 'ссылка возвращает в приложение с ?code= в запросе адреса — до #, фрагмент остаётся маршруту' \
  grep -qE "^$SITE/?\?code=[0-9a-f-]{36}\$" <<< "$redirect"
link_code=${redirect##*code=}
same 'код ссылки без проверочной строки устройства ничего не стоит → 400' \
  "$(exchange "$link_code" "$(new_verifier)")" 400
same '…с проверочной строкой устройства, запросившего письмо, → 200 и сессия' \
  "$(exchange "$link_code" "$boris_verifier" && body '.user.email')" '200"boris@example.com"'
boris=$(field '.access_token')
boris_id=$(field '.user.id')
same 'ссылка одноразовая: второй обмен → не 200' \
  "$([[ $(exchange "$link_code" "$boris_verifier") != 200 ]] && echo отклонён)" отклонён

# A returning user gets the «magic link» letter of Auth, a new one the «confirmation» letter: both are our template.
anna_verifier2=$(new_verifier)
same 'повторный вход Анны (адрес уже известен): POST /auth/v1/otp → 200' \
  "$(request_letter anna@example.com "$anna_verifier2")" 200
check '…снова одно письмо (всего два)' wait_letters anna@example.com 2
last_letter anna@example.com
check '…в нём тоже шестизначный код и ссылка' \
  bash -c "grep -qxE '[0-9]{6}' <<< '$(letter_codes)' && grep -q 'type=magiclink' <<< '$(letter_link)'"
same '…код подходит: у Анны вторая сессия (второе устройство)' "$(verify_code anna@example.com "$(letter_codes)")" 200
anna_phone=$(field '.access_token')
anna_phone_refresh=$(field '.refresh_token')

section 'сессия: токен обновляется, signOut отзывает её на сервере'
same 'обновление токена: POST /auth/v1/token?grant_type=refresh_token → 200' "$(refresh "$anna_refresh")" 200
check '…выдан новый токен доступа и новый токен обновления' \
  test "$(field '.refresh_token')" != "$anna_refresh" -a -n "$(field '.access_token')"
anna=$(field '.access_token')
anna_refresh=$(field '.refresh_token')
same 'выход: POST /auth/v1/logout?scope=local → 204' "$(call "$anna_phone" POST '/auth/v1/logout?scope=local')" 204
same '…сессия отозвана: её токен обновления больше не принимается' "$(refresh "$anna_phone_refresh")" 400
same '…другая сессия того же пользователя жива' "$(refresh "$anna_refresh")" 200
anna=$(field '.access_token')
anna_refresh=$(field '.refresh_token')

section 'profiles: user_id и region — назначается при создании аккаунта, пользователь изменить не может'
# PostgREST reloads its schema cache after migrate.sh asynchronously.
for _ in $(seq 1 30); do [[ $(call "$anna" GET '/rest/v1/profiles?select=region') == 200 ]] && break; sleep 1; done
same 'профиль создан вместе с аккаунтом, регион — регион развёртывания' \
  "$(call "$anna" GET '/rest/v1/profiles?select=user_id,region' && body)" "200[{\"user_id\":\"$anna_id\",\"region\":\"kz\"}]"
same 'Борис видит только свой профиль' \
  "$(call "$boris" GET '/rest/v1/profiles?select=user_id' && body)" "200[{\"user_id\":\"$boris_id\"}]"
same 'изменить регион нельзя: PATCH → 403' \
  "$(call "$anna" PATCH "/rest/v1/profiles?user_id=eq.$anna_id" '{"region":"eu"}')" 403
same '…удалить профиль нельзя' "$(call "$anna" DELETE "/rest/v1/profiles?user_id=eq.$anna_id")" 403
same '…создать второй (или чужой) профиль нельзя' \
  "$(call "$boris" POST /rest/v1/profiles "{\"user_id\":\"$anna_id\",\"region\":\"eu\"}")" 403
check '…и в SQL от имени пользователя' grep -q 'permission denied for table profiles' \
  <<< "$(as_user "$anna_id" "update public.profiles set region = 'eu'")"
same '…регион в базе прежний' "$(sql -c "select region from public.profiles where user_id = '$anna_id'")" kz
same 'без входа профили закрыты' "$(call '' GET '/rest/v1/profiles?select=region')" 401
check 'регион развёртывания пользователю недоступен ни на чтение, ни на запись' \
  grep -q 'permission denied for table lifeos_cell' <<< "$(as_user "$anna_id" 'select region from public.lifeos_cell')"
sql -q -c "update public.lifeos_cell set region = 'eu'"
check 'база другого региона (копия, восстановленная не в ту ячейку): migrate.sh отказывается работать' \
  bash -c "'$INFRA_DIR/migrate.sh' 2>&1 | grep -q 'принадлежит региону «eu»'"
sql -q -c "update public.lifeos_cell set region = 'kz'"
check '…в своём регионе — работает' "$INFRA_DIR/migrate.sh"

section 'возраст: пока он не подтверждён, сервер не принимает ни другое согласие, ни данные'
same 'согласие cloud без подтверждённого возраста → 403' "$(consent "$anna" cloud true)" 403
same '…сервер называет причину: age_required' "$(body '.details')" '"age_required"'
same 'отправка данных без подтверждённого возраста: sync_push → 403, age_required' \
  "$(push "$anna" "[$(task t1)]" && body '.details')" '403"age_required"'
same '…и пустая отправка тоже' "$(push "$anna" '[]')" 403
same '…ни одной строки не сохранено' "$(sql -c 'select count(*) from public.sync_rows')" 0
same 'подтверждение возраста без правила → 400' "$(consent "$anna" age true)" 400
same '…с неизвестным правилом → 400' "$(consent "$anna" age true '{"rule":"13+"}')" 400
same '…журнал пуст' "$(journal "$anna_id")" ''
same 'подтверждение возраста по правилу kz18+ → 201' "$(consent "$anna" age true '{"rule":"kz18+"}')" 201
same '…строка журнала — то, что читает клиент; год рождения на сервер не уходит' \
  "$(body '.[0] | [.kind, .granted, .text_version, .details, (.id | type), (.created_at | type)]')" \
  '["age",true,"2026-11",{"rule":"kz18+"},"number","string"]'
same 'правила 16+ и kz_guardian тоже принимаются (Борис: 16+)' \
  "$(consent "$boris" age true '{"rule":"kz_guardian"}')$(consent "$boris" age true '{"rule":"16+"}')" 201201
same 'после подтверждения возраста согласие cloud принимается' "$(consent "$anna" cloud true)" 201
same '…и данные тоже: sync_push → 200' "$(push "$anna" "[$(task t1)]" && body 'map(.applied)')" '200[true]'

section 'consents: журнал только на добавление, время сервера, действующее согласие — последняя строка вида'
same 'created_at — время сервера (сейчас), а не клиента' \
  "$(sql -c "select bool_and(created_at between now() - interval '5 minutes' and now()) from public.consents")" t
same 'подставить своё время нельзя: колонка created_at клиенту не выдана → 403' \
  "$(call "$anna" POST /rest/v1/consents '{"kind":"analytics","granted":true,"text_version":"v","created_at":"2020-01-01T00:00:00Z"}')" 403
same 'отзыв — новая строка granted: false' "$(consent "$anna" cloud false)" 201
same '…журнал Анны: три строки по порядку, ни одна не изменена' "$(journal "$anna_id")" 'age=true cloud=true cloud=false'
same '…действующее согласие — последняя строка вида: cloud отозвано, возраст подтверждён' \
  "$(call "$anna" GET '/rest/v1/consents?select=kind,granted&order=id.desc' && body '[.[] | select(.kind == "cloud")][0].granted, [.[] | select(.kind == "age")][0].granted' | tr '\n' ' ')" \
  '200false true '
same '…сервер считает так же (consent_in_force)' \
  "$(sql -c "select public.consent_in_force('$anna_id', 'cloud') || ' ' || public.consent_in_force('$anna_id', 'age') || ' ' || public.consent_in_force('$anna_id', 'analytics')")" \
  'false true false'
same 'неизвестный вид согласия → 400' "$(consent "$anna" marketing true)" 400
same 'остальные виды принимаются: cloud_health, analytics, third_party' \
  "$(consent "$anna" cloud_health true)$(consent "$anna" analytics true)$(consent "$anna" third_party false)" 201201201

section 'RLS журнала: пользователь читает и добавляет только свои строки (два пользователя, настоящий API)'
same 'Борис видит только свой журнал' \
  "$(call "$boris" GET '/rest/v1/consents?select=kind&order=id' && body 'map(.kind)')" '200["age","age"]'
same '…и по фильтру чужого user_id — ничего' \
  "$(call "$boris" GET "/rest/v1/consents?select=kind&user_id=eq.$anna_id" && body)" '200[]'
same 'Борис не может добавить строку от имени Анны: колонка user_id клиенту не выдана → 403' \
  "$(call "$boris" POST /rest/v1/consents "{\"kind\":\"cloud\",\"granted\":true,\"text_version\":\"v\",\"user_id\":\"$anna_id\"}")" 403
same '…его собственная строка получает его user_id' \
  "$(consent "$boris" cloud true > /dev/null && sql -c "select count(*) from public.consents where user_id = '$boris_id' and kind = 'cloud'")" 1
same '…журнал Анны не изменился' "$(journal "$anna_id")" \
  'age=true cloud=true cloud=false cloud_health=true analytics=true third_party=false'
same 'изменить строку журнала нельзя: PATCH своей строки → 403' \
  "$(call "$anna" PATCH '/rest/v1/consents?kind=eq.cloud' '{"granted":true}')" 403
same '…чужой — тоже' "$(call "$boris" PATCH "/rest/v1/consents?user_id=eq.$anna_id" '{"granted":false}')" 403
same 'удалить строку журнала нельзя: DELETE → 403' "$(call "$anna" DELETE '/rest/v1/consents?kind=eq.cloud')" 403
check '…и в SQL от имени пользователя: update' grep -q 'permission denied for table consents' \
  <<< "$(as_user "$anna_id" 'update public.consents set granted = true')"
check '…delete' grep -q 'permission denied for table consents' <<< "$(as_user "$anna_id" 'delete from public.consents')"
check '…в SQL строка другого пользователя не вставляется (политика RLS)' \
  grep -q 'permission denied\|row-level security' \
  <<< "$(as_user "$boris_id" "insert into public.consents (user_id, kind, granted, text_version) values ('$anna_id', 'cloud', true, 'v')")"
same 'без входа журнал закрыт: чтение' "$(call '' GET '/rest/v1/consents?select=kind')" 401
same '…и запись' "$(call '' POST /rest/v1/consents '{"kind":"age","granted":true,"text_version":"v","details":{"rule":"16+"}}')" 401
same 'RLS включён на profiles, consents и lifeos_cell' \
  "$(sql -c "select count(*) from pg_class where relrowsecurity and oid in ('public.profiles'::regclass, 'public.consents'::regclass, 'public.lifeos_cell'::regclass)")" 3
check 'служебные функции пользователю недоступны: consent_in_force' grep -q 'permission denied for function consent_in_force' \
  <<< "$(as_user "$anna_id" "select public.consent_in_force('$boris_id', 'cloud')")"
check '…sync_apply (правила отправки в обход проверки возраста)' grep -q 'permission denied for function sync_apply' \
  <<< "$(as_user "$anna_id" "select count(*) from public.sync_apply('[]')")"
same 'у каждой функции SECURITY DEFINER закреплён search_path' "$(sql << 'SQL'
select string_agg(proname, ',' order by proname) || ' — без search_path: '
  || count(*) filter (where not exists (select 1 from unnest(proconfig) setting where setting like 'search_path=%'))
from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
SQL
)" 'consents_before_insert,create_profile,delete_account,sync_push — без search_path: 0'

section 'возраст отозван: сервер снова не принимает согласия и данные; отозвать согласие можно всегда'
same 'отзыв подтверждения возраста → 201' "$(consent "$anna" age false)" 201
same '…новое согласие → 403, age_required' "$(consent "$anna" cloud true && body '.details')" '403"age_required"'
same '…данные → 403' "$(push "$anna" "[$(task t2)]")" 403
same '…а отозвать согласие можно: analytics=false → 201' "$(consent "$anna" analytics false)" 201
same '…получить свои данные обратно тоже можно: changes_since → 200' \
  "$(call "$anna" GET '/rest/v1/rpc/changes_since?since=0' && body 'map(.key)')" '200["t1"]'
same 'возраст подтверждён снова → данные принимаются' \
  "$(consent "$anna" age true '{"rule":"kz18+"}' > /dev/null && push "$anna" "[$(task t2)]")" 200

section 'delete_account(): строки во всех таблицах данных, профиль, журнал согласий и пользователь Auth удалены'
push "$boris" "[$(task b1)]" > /dev/null
push "$anna" '[{"table":"sleepLogs","key":"sleep:2026-11-05","updatedAt":1000,"updatedBy":"dev","data":{"quality":4}},
  {"table":"settings","key":"time.pomodoro","updatedAt":1000,"updatedBy":"dev","data":{"value":1}}]' > /dev/null
# left <user id>: what the server still holds of the user — "data rows / profile / journal / auth user / sessions".
left() {
  sql -c "select (select count(*) from public.sync_rows where user_id = '$1') || ' / '
    || (select count(*) from public.profiles where user_id = '$1') || ' / '
    || (select count(*) from public.consents where user_id = '$1') || ' / '
    || (select count(*) from auth.users where id = '$1') || ' / '
    || (select count(*) from auth.sessions where user_id = '$1')"
}
same 'до удаления у Анны есть данные в трёх таблицах, профиль, журнал, пользователь и сессия' \
  "$(left "$anna_id")" '4 / 1 / 9 / 1 / 1'
boris_before=$(left "$boris_id")
same 'без входа функция закрыта' "$(call '' POST /rest/v1/rpc/delete_account '{}')" 401
same 'назвать другого пользователя нельзя: у функции нет аргументов' \
  "$(call "$boris" POST /rest/v1/rpc/delete_account "{\"user_id\":\"$anna_id\"}")" 404
same '…данные Анны на месте' "$(left "$anna_id")" '4 / 1 / 9 / 1 / 1'
same 'Анна удаляет свой аккаунт: POST /rest/v1/rpc/delete_account → 204' \
  "$(call "$anna" POST /rest/v1/rpc/delete_account '{}')" 204
same '…на сервере от неё не осталось ничего' "$(left "$anna_id")" '0 / 0 / 0 / 0 / 0'
same '…и ни одной строки в таблицах-разделах (tasks, sleep_logs, settings)' \
  "$(sql -c "select (select count(*) from public.tasks where user_id = '$anna_id') + (select count(*) from public.sleep_logs where user_id = '$anna_id') + (select count(*) from public.settings where user_id = '$anna_id')")" 0
same '…аккаунт Бориса не тронут' "$(left "$boris_id")" "$boris_before"
same 'сессия удалённого аккаунта не обновляется' "$(refresh "$anna_refresh")" 400
same 'ещё не истёкший токен удалённого аккаунта: данные не принимаются' "$(push "$anna" "[$(task t3)]")" 403
same '…согласия тоже' \
  "$([[ $(consent "$anna" age true '{"rule":"16+"}') =~ ^4 ]] && echo отклонено)" отклонено
same '…и ничего не появилось' "$(left "$anna_id")" '0 / 0 / 0 / 0 / 0'
anna_verifier3=$(new_verifier)
same 'тот же адрес может завести аккаунт заново: письмо уходит' "$(request_letter anna@example.com "$anna_verifier3")" 200
check '…в письме снова код' wait_letters anna@example.com 3
last_letter anna@example.com
same '…новый аккаунт — новый пользователь с пустым журналом и своим профилем' \
  "$(verify_code anna@example.com "$(letter_codes)" > /dev/null && left "$(field '.user.id')")" '0 / 1 / 0 / 1 / 1'
check '…id нового аккаунта другой' test "$(field '.user.id')" != "$anna_id"

finish
