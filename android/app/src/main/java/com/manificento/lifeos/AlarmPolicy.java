package com.manificento.lifeos;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

/** Pure rules of the alarm (#139), unit-tested: stored dismissals, restoring after a reboot, the window bounds. */
final class AlarmPolicy {

    /** No alarm stored. */
    static final long NONE = -1L;
    /** Dismissals kept while JS does not take them (the app stays closed for days). */
    static final int MAX_DISMISSALS = 20;
    /** Longest smart-wake window, minutes (as MAX_ALARM_WINDOW_MIN in src/core/platform.ts). */
    static final int MAX_WINDOW_MIN = 120;
    /** A ringing alarm nobody switches off goes quiet after this long (not a dismissal). */
    static final long RING_TIMEOUT_MS = 10 * 60 * 1000L;

    private AlarmPolicy() {}

    /** Appends "dismissedAt:alarmAt" to the stored list "d:a;d:a", dropping the oldest above MAX_DISMISSALS. */
    static String appendDismissal(String stored, long dismissedAt, long alarmAt) {
        List<long[]> all = parseDismissals(stored);
        all.add(new long[] { dismissedAt, alarmAt });
        while (all.size() > MAX_DISMISSALS) all.remove(0);
        StringBuilder out = new StringBuilder();
        for (long[] d : all) {
            if (out.length() > 0) out.append(';');
            out.append(d[0]).append(':').append(d[1]);
        }
        return out.toString();
    }

    /** Pairs {dismissedAt, alarmAt}, oldest first; malformed entries are skipped. */
    static List<long[]> parseDismissals(String stored) {
        List<long[]> out = new ArrayList<>();
        if (stored == null || stored.isEmpty()) return out;
        for (String entry : stored.split(";")) {
            String[] parts = entry.split(":");
            if (parts.length != 2) continue;
            try {
                out.add(new long[] { Long.parseLong(parts[0]), Long.parseLong(parts[1]) });
            } catch (NumberFormatException e) {
                // skip a broken entry
            }
        }
        return out;
    }

    /** A reboot clears AlarmManager: set the stored alarm again (rolled to its next daily ring) if there is one. */
    static boolean shouldRestore(long at) {
        return at != NONE;
    }

    /**
     * The alarm repeats daily (#241): its next ring after `now` at the wall-clock `hour`:`minute` — `at` itself if still
     * ahead, else that clock time one or more days later. The clock time is passed in (not read from `at`), so a ring
     * moved by a spring-forward gap (02:30 → 03:30) comes back to 02:30 the next day.
     */
    static long nextDaily(long at, int hour, int minute, long now, TimeZone tz) {
        if (at > now) return at;
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(at);
        do {
            c.add(Calendar.DAY_OF_MONTH, 1);
            c.set(Calendar.HOUR_OF_DAY, hour);
            c.set(Calendar.MINUTE, minute);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
        } while (c.getTimeInMillis() <= now);
        return c.getTimeInMillis();
    }

    static boolean isValidWindow(int windowMin) {
        return windowMin >= 0 && windowMin <= MAX_WINDOW_MIN;
    }

    /**
     * Whether the ringing notification opens AlarmActivity over the lock screen. Android 14+ may withhold
     * USE_FULL_SCREEN_INTENT (canUseFullScreenIntent() false): then the alarm rings as a notification with «Выключить».
     */
    static boolean useFullScreen(int sdk, boolean canUseFullScreenIntent) {
        return sdk < 34 || canUseFullScreenIntent;
    }

    /** "HH:mm" for the alarm screen. */
    static String clockLabel(int hour, int minute) {
        return String.format(java.util.Locale.ROOT, "%02d:%02d", hour, minute);
    }
}
