-- The counters of `otp-attempts` (handler.lua): one per e-mail address and one per client address, in a shared
-- memory zone of this Kong (KONG_NGINX_HTTP_LUA_SHARED_DICT in docker-compose.yml) — all workers of one Kong count
-- together, and `incr` is atomic: of a burst of parallel attempts exactly the limit passes.
--
-- A counter that exists is never given up for a new one. The zone's own way of making room (`incr` with an initial
-- value, `set`, `add`) is to throw out the least recently used entries, expired or not: whoever sent attempts for
-- enough new addresses would wipe the count of the address they are guessing and start it anew. So a new counter is
-- created with `safe_add`, which takes only free room: in a full zone a new name is refused (the caller answers
-- 503 — nobody is let through uncounted) until windows end, and the names already counted go on being counted.
-- How many counters the zone holds — tests/otp-attempts.test.sh.
local ngx = ngx

local Counter = {
  DICT = "lifeos_otp_attempts",
}

-- The zone frees expired counters by itself only from its least recently used end, and stops at the first one that
-- is still alive: behind a single quiet counter a zone full of expired ones would go on refusing. `reclaim` frees
-- them all. It walks the whole zone, so a worker does it once a second at most — a flood must not buy a walk per
-- request.
local reclaimed_at = 0
local function reclaim(dict)
  local now = ngx.now()
  if now - reclaimed_at < 1 then
    return 0
  end
  reclaimed_at = now
  return dict:flush_expired()
end

-- add(name, window): counts one more attempt for `name`. Returns the number of attempts in its window — `window`
-- seconds from the first of them — or nil and the reason when the attempt could not be counted.
function Counter.add(name, window)
  local dict = ngx.shared[Counter.DICT]
  -- A digest instead of the name: every counter takes the same room, whatever the length of an e-mail address.
  local key = ngx.sha1_bin(name)
  -- Once more when another worker created the counter between the two calls, or when room was freed for it.
  for _ = 1, 3 do
    local count, err = dict:incr(key, 1)
    if count then
      return count
    end
    if err ~= "not found" then
      return nil, err
    end
    local added, add_err = dict:safe_add(key, 1, window)
    if added then
      return 1
    end
    if add_err == "no memory" then
      if reclaim(dict) == 0 then
        return nil, add_err
      end
    elseif add_err ~= "exists" then
      return nil, add_err
    end
  end
  return nil, "busy"
end

return Counter
