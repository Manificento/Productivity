package com.manificento.lifeos;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The smart moment inside the wake window (#250), pure and unit-tested. The twin of src/core/sleepPhases.ts:
 * same constants, same synthetic nights in the tests — change both together. JS does not run at night, so the alarm
 * decides here, from the night-sensing buffer (NightSampleStore lines).
 */
final class SmartWake {

    /** Below this 5-minute mean the sleeper lies still (deep sleep). */
    static final double LIGHT_MIN_MOVEMENT = 0.05;
    /** «Coming out of stillness»: the last 5 minutes move this many times more than the 15 before. */
    static final double RISE_FACTOR = 1.5;
    static final int RECENT_MIN = 5;
    static final int BEFORE_MIN = 15;
    /** Re-check every minute inside the window… */
    static final long CHECK_EVERY_MS = 60_000L;
    /** …a few seconds after the minute boundary, once the sensing service has written the minute that just ended. */
    static final long AFTER_FLUSH_MS = 5_000L;
    /** Sensing stopped: no new minute this long — ring (as without a smart alarm). */
    static final long STALE_MS = RECENT_MIN * 60_000L;
    private static final long MINUTE = 60_000L;

    enum Decision { RING, WAIT }

    private SmartWake() {}

    private static Map<Long, Double> byMinute(List<String> lines) {
        Map<Long, Double> out = new HashMap<>();
        for (String line : lines) {
            Long start = NightBuffer.minuteStart(line);
            Double movement = NightBuffer.movement(line);
            if (start != null && movement != null) out.put(start, movement);
        }
        return out;
    }

    /** Light sleep at the minute starting `minuteStart` — see isLightSleepAt in src/core/sleepPhases.ts. */
    static boolean isLightSleepAt(List<String> lines, long minuteStart) {
        Map<Long, Double> m = byMinute(lines);
        double before = 0;
        double recent = 0;
        int total = RECENT_MIN + BEFORE_MIN;
        for (int i = 0; i < total; i++) {
            Double v = m.get(minuteStart - (long) (total - 1 - i) * MINUTE);
            if (v == null) return false;
            if (i < BEFORE_MIN) before += v;
            else recent += v;
        }
        before /= BEFORE_MIN;
        recent /= RECENT_MIN;
        return recent >= LIGHT_MIN_MOVEMENT && recent >= before * RISE_FACTOR;
    }

    /**
     * At `now` inside the window ending `at`: ring at the end of the window, when sensing has stopped (the newest minute
     * in the buffer is older than STALE_MS, or there is none — e.g. sensing off: ring at the start of the window), or in
     * light sleep at the newest complete minute actually in the buffer (the minute that just ended may not be written
     * yet); otherwise wait for the next check.
     */
    static Decision decide(List<String> lines, long now, long at) {
        if (now >= at) return Decision.RING;
        Long newest = null;
        for (Map.Entry<Long, Double> e : byMinute(lines).entrySet()) {
            long start = e.getKey();
            if (start + MINUTE <= now && (newest == null || start > newest)) newest = start;
        }
        if (newest == null || now - (newest + MINUTE) > STALE_MS) return Decision.RING;
        return isLightSleepAt(lines, newest) ? Decision.RING : Decision.WAIT;
    }

    /** The next check: a few seconds after the next minute boundary, never past `at`. */
    static long nextCheck(long now, long at) {
        long next = now - Math.floorMod(now, MINUTE) + MINUTE + AFTER_FLUSH_MS;
        return Math.min(next, at);
    }

    /**
     * The first fire for an alarm at `at` with a window: its start; if the window has already begun (set late, or
     * restored after a reboot), `at` itself — this time it is a plain alarm, so a short nap alarm does not ring at once.
     */
    static long firstFire(long at, int windowMin, long now) {
        long start = at - windowMin * MINUTE;
        return start > now ? start : at;
    }
}
