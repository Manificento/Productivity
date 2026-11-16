#!/usr/bin/env bash
# Infra checks of issue #277: the SQL migrations of migrations/ apply to an empty database and give every synced
# table of the app a server table; row level security is checked with two users through the real API; the rules of
# `sync_push` (rev, future time, last writer wins, meals, unique keys, replace) and of `changes_since` are checked the
# same way.
# Needs Docker and jq. Run: infra/supabase/tests/migrations.test.sh
set -uo pipefail
. "$(dirname "$0")/lib.sh"

REPO_DIR=$(cd "$INFRA_DIR/../.." && pwd)
PASSWORD=synthetic-password-1

# same "<name>" <actual> <expected>: like check, and shows both values when they differ.
same() {
  if [[ $2 == "$3" ]]; then pass "$1"; else fail "$1 (получено «$2», ожидалось «$3»)"; fi
}

section 'подготовка: пустой стек kz'
new_region kz 8000 ENABLE_EMAIL_AUTOCONFIRM=true
use_region kz
"$INFRA_DIR/deploy.sh" || exit 1
api=$(local_api_url)

sql() { compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
# as_user <user id | ''> <sql>: runs the SQL the way PostgREST does for that user — the role and the token's claims
# (no user id — `anon`). Prints the result or the error.
as_user() {
  if [[ -n $1 ]]; then
    sql -q -c 'set role authenticated' \
      -c "set \"request.jwt.claims\" = '{\"sub\":\"$1\",\"role\":\"authenticated\"}'" -c "$2" 2>&1
  else
    sql -q -c 'set role anon' -c "$2" 2>&1
  fi
}
# call <token or ''> <method> <path> [json]: prints the HTTP status, leaves the response in $WORK/body.json.
call() {
  local token=$1 method=$2 path=$3 json=${4:-}
  local args=(-s -m 20 -o "$WORK/body.json" -w '%{http_code}' -X "$method" "$api$path" -H "apikey: $ANON_KEY")
  [[ -n $token ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n $json ]] && args+=(-H 'Content-Type: application/json' -d "$json")
  curl "${args[@]}" || true
}
# body [jq filter]: the last response, compact.
body() { jq -c "${1:-.}" "$WORK/body.json" 2> /dev/null; }
# push <token> <changes json array> [since] [replace]: prints the HTTP status.
push() { call "$1" POST /rest/v1/rpc/sync_push "{\"changes\":$2,\"since\":${3:-0},\"replace\":${4:-false}}"; }
# pull <token> [since] [max_rows]: prints the HTTP status.
pull() { call "$1" GET "/rest/v1/rpc/changes_since?since=${2:-0}&max_rows=${3:-500}"; }
# One change: change <table> <key> <updatedAt> <device> [data json | deleted]
change() {
  local data=${5:-}
  [[ -n $data ]] || data='{}'
  if [[ $data == deleted ]]; then
    jq -nc --arg t "$1" --arg k "$2" --argjson at "$3" --arg by "$4" \
      '{table: $t, key: $k, updatedAt: $at, updatedBy: $by, deletedAt: $at, data: {leaked: "содержимое удалённого"}}'
  else
    jq -nc --arg t "$1" --arg k "$2" --argjson at "$3" --arg by "$4" --argjson data "$data" \
      '{table: $t, key: $k, updatedAt: $at, updatedBy: $by, data: $data}'
  fi
}
signup() {
  curl -s -m 20 -X POST "$api/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" > "$WORK/$1.json"
  jq -r '.access_token // empty' "$WORK/$1.json"
}

section 'миграции применяются к пустому Postgres'
check 'migrate.sh завершается успешно' "$INFRA_DIR/migrate.sh"
same 'повторный запуск ничего не применяет' \
  "$("$INFRA_DIR/migrate.sh" 2>&1 | grep -c 'применено миграций — 0')" 1
same 'каждая миграция записана в public.lifeos_migrations' \
  "$(sql -c 'select count(*) from public.lifeos_migrations')" "$(find "$INFRA_DIR/migrations" -name '*.sql' | wc -l | tr -d ' ')"

app_tables=$(sed -n '/^export const TABLE_NAMES = \[/,/^\] as const;/p' "$REPO_DIR/src/core/db.ts" |
  grep -oE "'[A-Za-z]+'" | tr -d "'" | LC_ALL=C sort | paste -sd, -)
table_count=$(tr ',' '\n' <<< "$app_tables" | wc -l | tr -d ' ')
echo "  синхронизируемые таблицы ядра ($table_count): $app_tables"
# The tables of the sync: the partitions of sync_rows, each bound to the app's name of its table.
server_tables=$(sql << 'SQL'
select string_agg(app_name, ',' order by app_name collate "C")
from (
  select substring(pg_get_expr(c.relpartbound, c.oid) from $re$\('([^']+)'\)$re$) as app_name
  from pg_inherits i join pg_class c on c.oid = i.inhrelid
  where i.inhparent = 'public.sync_rows'::regclass
) t
SQL
)
check 'TABLE_NAMES прочитан из src/core/db.ts' test "$table_count" -ge 21
same 'на сервере есть таблица для каждой синхронизируемой таблицы ядра' "$server_tables" "$app_tables"
same '…у каждой колонки user_id, rev (серверная последовательность), deleted_at, updated_by' "$(sql << 'SQL'
select count(*)
from pg_inherits i
join pg_attribute a on a.attrelid = i.inhrelid and not a.attisdropped
where i.inhparent = 'public.sync_rows'::regclass and a.attname in ('user_id', 'rev', 'deleted_at', 'updated_by')
SQL
)" "$((table_count * 4))"
same '…и включённый RLS с политикой «только свои строки» (и у общей sync_rows)' "$(sql << 'SQL'
select count(*)
from pg_class c
join pg_policy p on p.polrelid = c.oid and p.polcmd = 'r'
where c.relrowsecurity
  and pg_get_expr(p.polqual, p.polrelid) like '%user_id = %uid()%'
  and (c.oid = 'public.sync_rows'::regclass
    or c.oid in (select inhrelid from pg_inherits where inhparent = 'public.sync_rows'::regclass))
SQL
)" "$((table_count + 1))"
same 'есть функция changes_since(rev)' \
  "$(sql -c "select pg_get_function_identity_arguments('public.changes_since(bigint, integer)'::regprocedure)")" \
  'since bigint, max_rows integer'
same 'sync_push — SECURITY DEFINER, и у всех таких функций public закреплён search_path' "$(sql << 'SQL'
select count(*) filter (where proname = 'sync_push') || ' из ' || count(*) || ', без search_path: '
  || count(*) filter (where not exists (select 1 from unnest(proconfig) setting where setting like 'search_path=%'))
from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
SQL
)" '1 из 1, без search_path: 0'

mkdir "$WORK/broken"
cp "$INFRA_DIR"/migrations/*.sql "$WORK/broken/"
printf 'create table public.half_done (id int);\nselect 1 / 0;\n' > "$WORK/broken/9999_broken.sql"
check 'миграция с ошибкой: migrate.sh завершается с ошибкой' \
  bash -c "! MIGRATIONS_DIR='$WORK/broken' '$INFRA_DIR/migrate.sh' > /dev/null 2>&1"
same '…и её транзакция отменена целиком: ни таблицы, ни записи в журнале' \
  "$(sql -c "select to_regclass('public.half_done') is null and not exists (select 1 from public.lifeos_migrations where name like '9999%')")" t

section 'RLS: пользователь видит только свои строки (два пользователя, настоящий API)'
anna=$(signup anna@example.com)
boris=$(signup boris@example.com)
check 'два пользователя зарегистрированы' test -n "$anna" -a -n "$boris"
anna_id=$(jq -r '.user.id' "$WORK/anna@example.com.json")
boris_id=$(jq -r '.user.id' "$WORK/boris@example.com.json")
# PostgREST reloads its schema cache after migrate.sh asynchronously.
for _ in $(seq 1 30); do [[ $(pull "$anna") == 200 ]] && break; sleep 1; done

annas="[$(change tasks t1 1000 dev-anna '{"title":"задача Анны"}'),
  $(change sleepLogs sleep:2026-11-05 1000 dev-anna '{"quality":4}'),
  $(change settings time.pomodoro 1000 dev-anna '{"value":{"focusMin":25}}')]"
same 'Анна отправляет три строки: sync_push → 200' "$(push "$anna" "$annas")" 200
same '…все приняты' "$(body 'map(.applied)')" '[true,true,true]'
# The shape src/core/sync/client.ts parses: these names and types are the wire contract.
same '…строка ответа sync_push — поля протокола (PushResult), числа — числами' \
  "$(body '.[0] | [keys, (.rev | type), (.updatedAt | type), .data, .deletedAt]')" \
  '[["applied","data","deletedAt","key","rev","table","updatedAt","updatedBy"],"number","number",null,null]'
same 'Анна получает свои строки: changes_since(0)' "$(pull "$anna" && body 'map(.key) | sort')" \
  '200["sleep:2026-11-05","t1","time.pomodoro"]'
same '…строка changes_since — поля протокола (PulledChange)' \
  "$(body 'map(select(.key == "t1")) | .[0] | del(.rev)')" \
  '{"table":"tasks","key":"t1","updatedAt":1000,"updatedBy":"dev-anna","deletedAt":null,"data":{"title":"задача Анны"}}'
same 'Борис не получает чужих строк: changes_since(0) пуст' "$(pull "$boris" && body)" '200[]'
same 'Борис не видит чужих строк через API: sync_rows пуста' \
  "$(call "$boris" GET '/rest/v1/sync_rows?select=id' && body)" '200[]'
same 'Анна видит через API свои строки, со своим user_id' \
  "$(call "$anna" GET '/rest/v1/sync_rows?select=user_id&table_name=eq.tasks' && body)" "200[{\"user_id\":\"$anna_id\"}]"
# PostgREST does not publish partitions, so the tables themselves are checked in SQL, as the API's roles.
same 'таблицы-разделы через API не опубликованы' "$(call "$anna" GET '/rest/v1/tasks?select=id')" 404
same 'RLS самой таблицы tasks: Борис не видит строк Анны' "$(as_user "$boris_id" 'select count(*) from public.tasks')" 0
same '…и sleep_logs, и settings' \
  "$(as_user "$boris_id" 'select (select count(*) from public.sleep_logs) + (select count(*) from public.settings)')" 0
same '…Анна видит свои' \
  "$(as_user "$anna_id" 'select (select count(*) from public.tasks) + (select count(*) from public.sleep_logs)')" 2
same 'без входа sync_rows закрыта' "$(call '' GET '/rest/v1/sync_rows?select=id')" 401
same 'без входа changes_since закрыта' "$(pull '')" 401
same 'без входа sync_push закрыта' "$(push '' "$annas")" 401
check 'без входа (роль anon) таблица закрыта и в SQL' \
  grep -q 'permission denied for table tasks' <<< "$(as_user '' 'select count(*) from public.tasks')"

forged="{\"user_id\":\"$anna_id\",\"table_name\":\"tasks\",\"id\":\"t9\",\"rev\":999999,\"updated_at\":1,\"updated_by\":\"x\",\"data\":{}}"
same 'Борис не может вставить строку напрямую' "$(call "$boris" POST /rest/v1/sync_rows "$forged")" 403
same '…изменить чужую строку' \
  "$(call "$boris" PATCH '/rest/v1/sync_rows?id=eq.t1' '{"data":{"title":"взломано"}}')" 403
same '…удалить чужую строку' "$(call "$boris" DELETE '/rest/v1/sync_rows?id=eq.t1')" 403
same 'и сама Анна пишет только через sync_push: прямая вставка закрыта' \
  "$(call "$anna" POST /rest/v1/sync_rows "${forged/t9/t8}")" 403
check 'прямая запись в таблицу-раздел закрыта и в SQL' grep -q 'permission denied for table tasks' \
  <<< "$(as_user "$boris_id" "update public.tasks set data = '{}' where id = 't1'")"
check 'последовательность rev пользователю недоступна' grep -q 'permission denied for sequence sync_rev' \
  <<< "$(as_user "$boris_id" "select nextval('public.sync_rev')")"

# The same key from Boris, with Anna's user_id slipped into the change: it must land in Boris's own rows.
slipped=$(change tasks t1 5000 dev-boris '{"title":"задача Бориса"}' | jq -c --arg id "$anna_id" '. + {user_id: $id}')
same 'Борис отправляет строку с тем же ключом и чужим user_id в теле: принята как его собственная' \
  "$(push "$boris" "[$slipped]" && body 'map(.applied)')" '200[true]'
same '…строка Анны не изменилась' \
  "$(sql -c "select data ->> 'title' || ' / ' || updated_by from public.tasks where user_id = '$anna_id' and id = 't1'")" \
  'задача Анны / dev-anna'
same '…у Бориса своя строка с этим ключом' \
  "$(sql -c "select data ->> 'title' from public.tasks where user_id = '$boris_id' and id = 't1'")" 'задача Бориса'
same '…Анна по-прежнему получает только свои три строки' "$(pull "$anna" && body 'length')" '2003'

section 'sync_push: сервер присваивает rev, подрезает время из будущего, last-writer-wins'
now_ms=$(date +%s%3N)
push "$anna" "[$(change tasks future $((now_ms + 86400000)) dev-anna), $(change tasks near $((now_ms + 120000)) dev-anna)]" > /dev/null
stored_future=$(body '.[0].updatedAt')
check 'updatedAt на сутки вперёд подрезан до серверного времени' \
  test "$stored_future" -ge "$((now_ms - 60000))" -a "$stored_future" -le "$((now_ms + 300000))"
same 'updatedAt на две минуты вперёд оставлен как есть' "$(body '.[1].updatedAt')" "$((now_ms + 120000))"
same '…и в базе лежит подрезанное время' \
  "$(sql -c "select updated_at from public.tasks where user_id = '$anna_id' and id = 'future'")" "$stored_future"
revs=$(body 'map(.rev)')
push "$anna" "[$(change tasks future $((now_ms + 600000)) dev-anna)]" > /dev/null
check 'каждая сохранённая версия получает свой rev, больше прежних' \
  test "$(body '.[0].rev')" -gt "$(jq -n "$revs | max")" -a "$(jq -n "$revs | unique | length")" == 2

push "$anna" "[$(change tasks t1 500 dev-zzz '{"title":"старая правка"}')]" > /dev/null
same 'правка старее сохранённой не принята; в ответе — версия сервера с содержимым' \
  "$(body '.[0] | [.applied, .updatedAt, .updatedBy, .data.title]')" '[false,1000,"dev-anna","задача Анны"]'
push "$anna" "[$(change tasks t1 1000 dev-aaa '{"title":"то же время, меньшее устройство"}')]" > /dev/null
same 'при равном updatedAt меньший updatedBy проигрывает' "$(body '.[0].applied')" false
push "$anna" "[$(change tasks t1 1000 dev-bbb '{"title":"то же время, большее устройство"}')]" > /dev/null
same '…больший updatedBy побеждает' "$(body '.[0] | [.applied, .updatedBy]')" '[true,"dev-bbb"]'
push "$anna" "[$(change tasks t1 1000 Dev-UPPER '{"title":"заглавные буквы меньше строчных"}')]" > /dev/null
same '…сравнение побайтовое, как в JavaScript' "$(body '.[0].applied')" false

push "$anna" "[$(change tasks t1 3000 dev-anna deleted)]" > /dev/null
same 'удаление позже правки принято' "$(body '.[0] | [.applied, .deletedAt]')" '[true,3000]'
same '…tombstone хранится без содержимого, даже если клиент его прислал' \
  "$(pull "$anna" && body 'map(select(.key == "t1")) | .[0] | [.deletedAt, .data]')" '200[3000,null]'
push "$anna" "[$(change tasks t1 2000 dev-anna '{"title":"правка до удаления"}')]" > /dev/null
same 'правка раньше удаления не принята' "$(body '.[0] | [.applied, .deletedAt]')" '[false,3000]'
push "$anna" "[$(change tasks t1 4000 dev-anna '{"title":"правка после удаления"}')]" > /dev/null
same 'правка позже удаления возвращает запись' \
  "$(body '.[0].applied') $(sql -c "select deleted_at is null and data ->> 'title' = 'правка после удаления' from public.tasks where user_id = '$anna_id' and id = 't1'")" 'true t'

push "$anna" "[$(change tasks t1 1 dev-anna '{"title":"из копии"}')]" 0 true > /dev/null
same 'replace: «заменить данные в облаке» принимает и более старую версию' \
  "$(body '.[0] | [.applied, .updatedAt]')" '[true,1]'

meal='meal:2026-11-05:lunch'
push "$anna" "[$(change mealLogs "$meal" 1000 dev-phone '{"items":[{"id":"суп","updatedAt":1000}]}')]" > /dev/null
meal_rev=$(body '.[0].rev')
later=$(change mealLogs "$meal" 2000 dev-laptop '{"items":[{"id":"хлеб","updatedAt":2000}]}')
push "$anna" "[$later]" "$((meal_rev - 1))" > /dev/null
same 'приём пищи, записанный другим устройством после курсора, не перезаписывается; в ответе — его элементы' \
  "$(body '.[0] | [.applied, .updatedBy, .data.items[0].id]')" '[false,"dev-phone","суп"]'
push "$anna" "[$later]" "$meal_rev" > /dev/null
same '…после того как устройство его увидело (курсор догнал) — принимается' "$(body '.[0].applied')" true
push "$anna" "[$(change mealLogs "$meal" 3000 dev-laptop '{"items":[]}')]" 0 > /dev/null
same '…своя же предыдущая версия отправке не мешает' "$(body '.[0].applied')" true
meal_rev=$(body '.[0].rev')
push "$anna" "[$(change mealLogs "$meal" 9000 dev-phone deleted)]" "$((meal_rev - 1))" > /dev/null
same 'удаление приёма пищи устройством, которое не видело запись другого устройства, не принято; в ответе — живая запись' \
  "$(body '.[0] | [.applied, .updatedBy, .deletedAt, (.data.items | length)]')" '[false,"dev-laptop",null,0]'
push "$anna" "[$(change mealLogs "$meal" 9000 dev-phone deleted)]" "$meal_rev" > /dev/null
same '…после того как устройство её увидело (курсор догнал) — удаление принимается' \
  "$(body '.[0] | [.applied, .deletedAt]')" '[true,9000]'

far=$((now_ms + 86400000))
items="[{\"id\":\"суп\",\"grams\":300,\"updatedAt\":$far},
  {\"id\":\"хлеб\",\"updatedAt\":$((now_ms + 120000)),\"deletedAt\":$far},
  {\"id\":\"чай\",\"updatedAt\":1000}, \"не элемент\"]"
push "$anna" "[$(change mealLogs meal:2026-11-06:lunch "$now_ms" dev-phone "{\"kind\":\"lunch\",\"items\":$items}")]" > /dev/null
pull "$anna" > /dev/null
stored_items=$(body 'map(select(.key == "meal:2026-11-06:lunch")) | .[0].data.items')
soup_at=$(jq '.[0].updatedAt' <<< "$stored_items")
check 'время элемента приёма пищи на сутки вперёд подрезано до серверного, как и время записи' \
  test "$soup_at" -ge "$((now_ms - 60000))" -a "$soup_at" -le "$((now_ms + 300000))"
same '…deletedAt элемента — тоже; остальное в элементах и их порядок не тронуты' \
  "$(jq -c --argjson cut "$soup_at" '[.[0].grams, .[1].updatedAt, .[1].deletedAt == $cut, .[2], .[3]]' <<< "$stored_items")" \
  "[300,$((now_ms + 120000)),true,{\"id\":\"чай\",\"updatedAt\":1000},\"не элемент\"]"
same '…у записи не из mealLogs содержимое не меняется' \
  "$(push "$anna" "[$(change tasks items 1000 dev-anna "{\"items\":[{\"updatedAt\":$far}]}")]" > /dev/null
    sql -c "select data -> 'items' -> 0 ->> 'updatedAt' from public.tasks where user_id = '$anna_id' and id = 'items'")" "$far"

section 'sync_push: уникальный ключ не из id — одна сессия программы на день (plannedSessions)'
thursday='{"programId":"p1","date":"2026-11-12","status":"planned"}'
push "$anna" "[$(change plannedSessions s1 1000 dev-phone "$thursday")]" > /dev/null
s1_rev=$(body '.[0].rev')
same 'первая сессия дня принята' "$(body '.[0].applied')" true
push "$anna" "[$(change plannedSessions s2 2000 dev-laptop "$thursday")]" "$((s1_rev - 1))" > /dev/null
same 'сессия на день, занятый строкой другого устройства после курсора, не принята; версии строки у сервера нет — rev 0, без содержимого' \
  "$(body '.[0] | [.applied, .key, .rev, .data, .deletedAt]')" '[false,"s2",0,null,null]'
same '…и не сохранена' \
  "$(sql -c "select count(*) from public.planned_sessions where user_id = '$anna_id' and id = 's2'")" 0
push "$anna" "[$(change plannedSessions s3 1000 dev-laptop '{"programId":"p1","date":"2026-11-11"}')]" > /dev/null
push "$anna" "[$(change plannedSessions s3 2000 dev-laptop "$thursday")]" "$((s1_rev - 1))" > /dev/null
same '…у сервера есть версия самой строки — она в ответе и осталась как была' \
  "$(body '.[0] | [.applied, .updatedAt, .data.date]')" '[false,1000,"2026-11-11"]'
others="[$(change plannedSessions s4 2000 dev-laptop '{"programId":"p2","date":"2026-11-12"}'),
  $(change plannedSessions s5 2000 dev-phone "$thursday"),
  $(change plannedSessions s6 2000 dev-laptop deleted),
  $(change plannedSessions s7 2000 dev-laptop '{"programId":"p1"}')]"
push "$anna" "$others" "$((s1_rev - 1))" > /dev/null
same '…другая программа, строка того же устройства, удаление и строка без ключа приняты' \
  "$(body 'map(.applied)')" '[true,true,true,true]'
push "$anna" "[$(change plannedSessions s2 2000 dev-laptop "$thursday")]" "$(body 'map(.rev) | max')" > /dev/null
same '…после того как устройство увидело занявшие день строки (курсор догнал), сервер отправке не мешает' \
  "$(body '.[0].applied')" true
push "$anna" "[$(change plannedSessions s8 2000 dev-tablet "$thursday")]" 0 true > /dev/null
same '…и replace принимает всё' "$(body '.[0].applied')" true
check 'служебные функции sync_push пользователю недоступны' grep -q 'permission denied for function sync_unique_key' \
  <<< "$(as_user "$anna_id" "select public.sync_unique_key('tasks', '{}')")"
check '…и sync_cut_item_times' grep -q 'permission denied for function sync_cut_item_times' \
  <<< "$(as_user "$anna_id" "select public.sync_cut_item_times('{}', 0)")"

section 'sync_push: пачка с ошибкой отклоняется целиком'
count_before=$(sql -c "select count(*) from public.sync_rows where user_id = '$anna_id'")
same 'неизвестная таблица: вся пачка отклонена' \
  "$(push "$anna" "[$(change tasks ok 1 dev-anna), $(change noSuchTable x 1 dev-anna)]")" 400
same 'строка без содержимого и без deletedAt отклонена' \
  "$(push "$anna" '[{"table":"tasks","key":"empty","updatedAt":1,"updatedBy":"dev-anna"}]')" 400
same 'больше 500 изменений за вызов отклонено' "$(push "$anna" \
  "$(jq -nc '[range(501) | {table: "tasks", key: "k\(.)", updatedAt: 1, updatedBy: "dev-anna", data: {}}]')")" 400
same '…ни одна строка отклонённых пачек не сохранена' \
  "$(sql -c "select count(*) from public.sync_rows where user_id = '$anna_id'")" "$count_before"

section 'changes_since: только rev больше курсора, по порядку, пачками'
pull "$anna" > /dev/null
all_revs=$(body 'map(.rev)')
same 'строки идут по возрастанию rev' "$(jq -nc "$all_revs | . == sort")" true
third=$(jq -n "$all_revs | .[2]")
same 'курсор: возвращаются только rev больше since' \
  "$(pull "$anna" "$third" && body 'map(.rev)')" "200$(jq -nc "$all_revs | .[3:]")"
same 'max_rows ограничивает пачку; следующая начинается с последнего rev' \
  "$(pull "$anna" 0 2 && body 'map(.rev)')" "200$(jq -nc "$all_revs | .[:2]")"
same 'после последней строки пачка пуста' "$(pull "$anna" "$(jq -n "$all_revs | max")" && body)" '200[]'

finish
