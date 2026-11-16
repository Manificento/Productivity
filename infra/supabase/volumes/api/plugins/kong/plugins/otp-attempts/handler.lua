-- otp-attempts: sign-in attempts are counted per ACCOUNT, not only per client address (issue #278, ADR-0013 p. 10).
--
-- Auth (GoTrue) limits code checks per client address and has no limit per account: a wrong code changes nothing, so
-- an attacker with many addresses could try the whole six-digit space of somebody's code. This plugin stands on the
-- route of /auth/v1/verify — the only way a code or a link of the sign-in letter becomes a session — and lets
-- `limit` attempts per e-mail address through in `window` seconds, whatever addresses they come from. The next one
-- gets 429 until the window ends.
--
-- Before that it counts the attempts of the CLIENT address: `client_limit` in `client_window` seconds, whatever
-- accounts they name. An attempt past it gets 429 and is counted for no account — so one client can neither fill the
-- memory of the counters with ever new e-mail addresses nor use up the attempts of every account it knows.
--
-- For that every attempt has to NAME its account, so only two shapes of the request pass:
--
--   POST {"type":"email","email":…,"token":<code>}        the code typed in the app (core/account/authApi.ts)
--   GET  ?token=<hash>&type=…&email=…&otp=<code>           the link of the letter (volumes/api/mail/sign-in.html)
--
-- The link carries Auth's token — the SHA-224 of the address and the code — which names nobody by itself. The letter
-- therefore adds the address and the code, and the hash is checked here: a link that does not match its address and
-- code never reaches Auth, so a guess cannot be counted against another address. POST with `token_hash` (the same
-- hash without an address) is not accepted at all. Anybody who has the link has the code anyway: the hash of a known
-- address and six digits is reversed in a moment.
--
-- The counters live in a shared memory zone of this Kong (counter.lua): one Kong per region, and a restart starts the
-- windows anew. Every attempt is counted BEFORE Auth sees it, right or wrong — a count taken from the answer would
-- let a burst of parallel requests through (which is why the limit per client is not Kong's own rate-limiting: that
-- plugin reads its counter first and adds to it later). An attempt that cannot be counted — the zone is full of
-- other counters, which takes thousands of client addresses — does not pass either: 503.
local cjson = require "cjson.safe"
local sha224 = require "resty.sha224"
local to_hex = require("resty.string").to_hex
local counter = require "kong.plugins.otp-attempts.counter"

local kong = kong
local ngx = ngx

-- What the app sends, and nothing else: Auth matches the names of JSON fields without regard to case, so an unknown
-- field could be an address this plugin did not count.
local POST_FIELDS = { type = true, email = true, token = true }
local LINK_TYPES = { signup = true, magiclink = true }

local OtpAttempts = {
  -- After cors (2000), key-auth (1250), acl (950) and rate-limiting (910): a request they refuse is not counted.
  PRIORITY = 900,
  VERSION = "1.0.0",
}

local function refuse(status, error_code, msg)
  return kong.response.exit(status, { code = status, error_code = error_code, msg = msg })
end

local function malformed()
  return refuse(400, "validation_failed", "Sign-in needs the address and the code of the letter")
end

-- The address as Auth will look it up: Auth takes printable ASCII only and lower-cases it. Anything else is refused
-- here, so that two spellings Auth reads as one address never get two counters.
local function address_of(value)
  if type(value) ~= "string" or #value > 255 or not value:find("^[\33-\126]+$") or not value:find("@", 1, true) then
    return nil
  end
  return value:lower()
end

-- Exactly `length` digits: with a fixed length, «address .. code» splits in one way only.
local function is_code(value, length)
  return type(value) == "string" and #value == length and value:find("^%d+$") ~= nil
end

local function token_hash(email, code)
  local digest = sha224:new()
  digest:update(email .. code)
  return to_hex(digest:final())
end

-- Without a counter there is no limit: nothing passes.
local function not_counted(err)
  kong.log.err("otp-attempts: the attempt could not be counted: ", err)
  return refuse(503, "unexpected_failure", "Sign-in is not available now")
end

-- Counts the attempt — for its client first, then for the address — and refuses it past either limit.
local function count(conf, email)
  -- The address Kong takes for the client's: the one the connection comes from, or the one a trusted reverse proxy
  -- named (KONG_TRUSTED_IPS). Auth gets the same one in X-Real-IP.
  local from_client, err = counter.add("client:" .. kong.client.get_forwarded_ip(), conf.client_window)
  if not from_client then
    return not_counted(err)
  end
  if from_client > conf.client_limit then
    return refuse(429, "over_request_rate_limit", "Слишком много попыток входа из вашей сети. Повторите через час")
  end
  local attempts
  attempts, err = counter.add("account:" .. email, conf.window)
  if not attempts then
    return not_counted(err)
  end
  if attempts > conf.limit then
    return refuse(429, "over_request_rate_limit",
      "Слишком много попыток входа для этого адреса. Подождите 15 минут и запросите новое письмо")
  end
end

local function check_code(conf)
  local raw = kong.request.get_raw_body()
  if type(raw) ~= "string" or #raw > 4096 then
    return malformed()
  end
  local body = cjson.decode(raw)
  if type(body) ~= "table" then
    return malformed()
  end
  for name in pairs(body) do
    if not POST_FIELDS[name] then
      return malformed()
    end
  end
  local email = address_of(body.email)
  if body.type ~= "email" or not email or not is_code(body.token, conf.otp_length) then
    return malformed()
  end
  return count(conf, email)
end

local function check_link(conf)
  local query = kong.request.get_query()
  local token, kind, code, redirect_to = query.token, query.type, query.otp, query.redirect_to
  local email = address_of(query.email)
  -- A parameter given twice is a table, one without a value is `true`: Auth would read them its own way.
  if type(token) ~= "string" or not LINK_TYPES[kind] or not email or not is_code(code, conf.otp_length)
    or (redirect_to ~= nil and type(redirect_to) ~= "string") then
    return malformed()
  end
  local hash = token_hash(email, code)
  if token ~= hash and token ~= "pkce_" .. hash then
    return malformed()
  end
  -- Auth gets exactly what was checked here, written anew: no second reading of the same query.
  kong.service.request.set_raw_query(ngx.encode_args({ token = token, type = kind, redirect_to = redirect_to }))
  return count(conf, email)
end

function OtpAttempts:access(conf)
  local method = kong.request.get_method()
  if method == "POST" then
    return check_code(conf)
  elseif method == "GET" then
    return check_link(conf)
  end
  return refuse(405, "method_not_allowed", "Method not allowed")
end

return OtpAttempts
