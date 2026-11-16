-- otp-attempts: sign-in attempts are counted per ACCOUNT, not only per client address (issue #278, ADR-0013 p. 1).
--
-- Auth (GoTrue) limits code checks per client address and has no limit per account: a wrong code changes nothing, so
-- an attacker with many addresses could try the whole six-digit space of somebody's code. This plugin stands on the
-- route of /auth/v1/verify — the only way a code or a link of the sign-in letter becomes a session — and lets
-- `limit` attempts per e-mail address through in `window` seconds, whatever addresses they come from. The next one
-- gets 429 until the window ends.
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
-- The counter lives in a shared memory zone of this Kong (KONG_NGINX_HTTP_LUA_SHARED_DICT in docker-compose.yml): one
-- Kong per region, and a restart starts the windows anew. Every attempt is counted BEFORE Auth sees it, right or
-- wrong — a count taken from the answer would let a burst of parallel requests through.
local cjson = require "cjson.safe"
local sha224 = require "resty.sha224"
local to_hex = require("resty.string").to_hex

local kong = kong
local ngx = ngx

local DICT = "lifeos_otp_attempts"
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

-- Counts one attempt for the address; true when it is within the limit.
local function attempt_allowed(conf, email)
  local attempts, err = ngx.shared[DICT]:incr("verify:" .. email, 1, 0, conf.window)
  if not attempts then
    kong.log.err("otp-attempts: the attempt could not be counted: ", err)
    return nil
  end
  return attempts <= conf.limit
end

local function count(conf, email)
  local allowed = attempt_allowed(conf, email)
  if allowed == nil then
    -- Without a counter there is no limit: nothing passes.
    return refuse(503, "unexpected_failure", "Sign-in is not available now")
  end
  if not allowed then
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
