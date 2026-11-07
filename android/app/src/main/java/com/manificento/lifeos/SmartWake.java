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
    /** Re-check every minute inside the window. */
    static final long CHECK_EVERY_MS = 60_000L;
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
     * At `now` inside the window ending `at`: ring in light sleep, at the end of the window, or when the buffer has no
     * readings for the last minutes (sensing off — ring at the start of the window, as without a smart alarm);
     * otherwise wait a minute.
     */
    static Decision decide(List<String> lines, long now, long at) {
        if (now >= at) return Decision.RING;
        long minute = now - Math.floorMod(now, MINUTE) - MINUTE; // the last complete minute
        Map<Long, Double> m = byMinute(lines);
        boolean recentData = false;
        for (int i = 0; i < RECENT_MIN; i++) if (m.containsKey(minute - i * MINUTE)) recentData = true;
        if (!recentData) return Decision.RING;
        return isLightSleepAt(lines, minute) || isLightSleepAt(lines, minute + MINUTE) ? Decision.RING : Decision.WAIT;
    }
}
