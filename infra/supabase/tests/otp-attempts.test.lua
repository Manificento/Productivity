-- The counters of sign-in attempts (plugin otp-attempts): the limit per client, and what happens when the memory
-- zone is full. Run by otp-attempts.test.sh with `resty` of the pinned Kong image and the zone exactly as
-- docker-compose.yml declares it:
--
--   resty --shdict '<zone>' -I /home/kong/plugins otp-attempts.test.lua <the least number of counters the zone holds>
--
-- Prints one line per check, `ok <name>` or `not ok <name>`, and `done <number of checks>` at the end.
local cjson = require "cjson.safe"
local counter = require "kong.plugins.otp-attempts.counter"

local WINDOW = 900 -- the window of an account in kong.yml: the lifetime of a code
local SHORT = 8 -- the window of the floods below, seconds: the test waits for it to end
local FLOOR = tonumber(arg[1])
-- More new addresses than any zone of a sane size holds: a counter that never refuses stops here.
local GUARD = 3000000

local checks = 0
local function check(name, ok, got)
  checks = checks + 1
  print(ok and "ok " or "not ok ", name, (not ok and got ~= nil) and (" (получено «" .. tostring(got) .. "»)") or "")
end

-- The plugin itself answers through Kong; here the few functions of Kong it calls for a code typed in the app are
-- replaced (rawset: `resty` warns about a global written the plain way).
local request, client, answered
rawset(_G, "kong", {
  request = {
    get_method = function() return "POST" end,
    get_raw_body = function() return request end,
  },
  client = { get_forwarded_ip = function() return client end },
  response = { exit = function(status) answered = status end },
  log = { err = function() end },
})
local plugin = require "kong.plugins.otp-attempts.handler"
-- The settings of kong.yml; SHORT_LIVED — the same limits with windows the test can wait for.
local CONF = { limit = 10, window = WINDOW, client_limit = 60, client_window = 3600, otp_length = 6 }
local SHORT_LIVED = { limit = 10, window = SHORT, client_limit = 60, client_window = SHORT, otp_length = 6 }
-- answer_to(email, from[, conf]): the status the plugin answers a sign-in attempt for the address from that client
-- with, or «к Auth» when it lets the attempt through.
local function answer_to(email, from, conf)
  request, client, answered = cjson.encode({ type = "email", email = email, token = "000000" }), from, "к Auth"
  plugin:access(conf or CONF)
  return answered
end
-- answers(count, email_of, from_of[, conf]): the answers to `count` attempts in a row, as "60 к Auth, 1 429".
local function answers(count, email_of, from_of, conf)
  local runs = {}
  for i = 1, count do
    local answer = tostring(answer_to(email_of(i), from_of(i), conf))
    if #runs > 0 and runs[#runs].answer == answer then
      runs[#runs].count = runs[#runs].count + 1
    else
      runs[#runs + 1] = { answer = answer, count = 1 }
    end
  end
  for i, run in ipairs(runs) do
    runs[i] = run.count .. " " .. run.answer
  end
  return table.concat(runs, ", ")
end
local function always(value)
  return function() return value end
end

-- A stranger's address of nearly the greatest length the plugin lets through (255 characters).
local function stranger(i)
  return string.rep("a", 230) .. i .. "@example.com"
end

-- A counter that was touched once and is not heard of again until the end: the least recently used one of the zone.
check("первая попытка — счёт 1", counter.add("quiet", WINDOW) == 1)
local counts = {}
for i = 1, 11 do
  counts[i] = tostring(counter.add("victim", WINDOW))
end
check("попытки считаются подряд: одиннадцатая — 11", table.concat(counts, " ") == "1 2 3 4 5 6 7 8 9 10 11",
  table.concat(counts, " "))

local got = answers(12, always("target@example.com"), function(i) return "198.51.100." .. i end)
check("плагин: 12 попыток для одного адреса почты от 12 клиентов — 10 проходят к Auth, дальше 429",
  got == "10 к Auth, 2 429", got)

-- One client, ever new accounts.
local flooder = "203.0.113.60"
got = answers(61, function(i) return "nobody-" .. i .. "@example.com" end, always(flooder), SHORT_LIVED)
check("плагин: один клиент шлёт попытки, каждую для нового адреса почты, — 60 проходят к Auth, 61-я — 429",
  got == "60 к Auth, 1 429", got)
got = answers(12, always("bystander@example.com"), always(flooder), SHORT_LIVED)
check("…следующие 12 его попыток, все для одного адреса почты, — тоже 429", got == "12 429", got)
got = answer_to("bystander@example.com", "203.0.113.70")
check("…этому адресу почты они не засчитаны: его попытка от другого клиента проходит", got == "к Auth", got)

-- The zone is filled past the plugin: with its limit per client that would take thousands of client addresses.
local held, refusal = 0, "ни одного отказа"
for i = 1, GUARD do
  local count, err = counter.add(stranger(i), SHORT)
  if not count then
    refusal = err
    break
  end
  held = held + 1
end
check("зона заполнена попытками для новых адресов: очередному новому адресу отказано (no memory) — "
  .. "попытка не посчитана", refusal == "no memory", refusal)
local victim = counter.add("victim", WINDOW)
check("…счётчик, дошедший до 11, пережил " .. held .. " новых: следующая попытка — 12-я, а не первая",
  victim == 12, victim)
check("…адрес любой длины занимает в зоне одно и то же место: она вмещает не меньше " .. FLOOR
  .. " счётчиков (вместила ещё " .. held .. ")", held >= FLOOR, held)
local known = counter.add(stranger(1), SHORT)
check("…те, у кого счётчик уже есть, считаются и в полной зоне", known == 2, known)
got = answer_to("late@example.com", "198.51.100.1")
check("плагин: попытка для нового адреса почты в полной зоне — 503: без счёта к Auth не проходит никто",
  got == 503, got)
got = answer_to("bystander@example.com", "203.0.113.99")
check("…попытка нового клиента — тоже 503", got == 503, got)
got = answer_to("target@example.com", "198.51.100.1")
check("…а адресу почты, исчерпавшему свои попытки, по-прежнему 429", got == 429, got)

ngx.sleep(SHORT + 1)
-- The zone gives the room of expired counters back lazily, from its least recently used end — and there stands the
-- quiet counter, whose window is not over.
local newcomer, err = counter.add("newcomer", WINDOW)
check("окна новых адресов истекли: их место отдано следующему новому, хотя счётчик, не тронутый дольше всех, "
  .. "ещё жив", newcomer == 1, newcomer or err)
local expired = counter.add(stranger(2), SHORT)
check("…счёт с истёкшим окном начинается заново", expired == 1, expired)
victim = counter.add("victim", WINDOW)
check("…счёт с неистёкшим окном продолжается — 13", victim == 13, victim)
local quiet = counter.add("quiet", WINDOW)
check("…и счётчик, не тронутый дольше всех, никто не вытеснил: вторая попытка — 2", quiet == 2, quiet)
got = answer_to("late@example.com", "203.0.113.99")
check("плагин: попытка нового клиента для нового адреса почты снова проходит к Auth", got == "к Auth", got)
got = answer_to("nobody-62@example.com", flooder, SHORT_LIVED)
check("…окно клиента, исчерпавшего свои 60 попыток, истекло: его попытка проходит", got == "к Auth", got)
got = answer_to("target@example.com", "198.51.100.1")
check("…а окно адреса почты (15 минут) — нет: ему по-прежнему 429", got == 429, got)

print("done ", checks)
