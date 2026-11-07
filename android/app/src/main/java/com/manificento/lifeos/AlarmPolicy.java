package com.manificento.lifeos;

import java.util.ArrayList;
import java.util.List;

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

    /** A reboot clears AlarmManager: set the stored alarm again only if it is still ahead. */
    static boolean shouldRestore(long at, long now) {
        return at != NONE && at > now;
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
