package com.manificento.lifeos;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

/**
 * The one alarm (time and smart-wake window) and the dismissals JS has not taken yet, in private preferences in
 * device-protected storage: after a night reboot the alarm is restored and rings before the phone is unlocked.
 */
final class AlarmStore {

    private static final String PREFS = "lifeos_alarm";
    private static final String AT = "at";
    private static final String WINDOW = "windowMin";
    private static final String DISMISSALS = "dismissals";
    /** Wall-clock time of the alarm (minutes after midnight), for the daily repeat. */
    private static final String CLOCK = "clockMin";

    private AlarmStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.createDeviceProtectedStorageContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Sets the alarm (from JS): its time, window and wall-clock time for the daily repeat. */
    static synchronized void saveAlarm(Context context, long at, int windowMin) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(at);
        int clock = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        prefs(context).edit().putLong(AT, at).putInt(WINDOW, windowMin).putInt(CLOCK, clock).commit();
    }

    /**
     * Moves the stored alarm to its next daily ring after `now` and returns it (AlarmPolicy.NONE when there is none).
     * Read, compute and save under the store's lock, so a new alarm from JS at the same moment is not overwritten.
     */
    static synchronized long rollDaily(Context context, long now, TimeZone tz) {
        SharedPreferences p = prefs(context);
        long at = p.getLong(AT, AlarmPolicy.NONE);
        if (at == AlarmPolicy.NONE) return AlarmPolicy.NONE;
        int clock = p.getInt(CLOCK, -1);
        if (clock < 0) {
            Calendar c = Calendar.getInstance(tz);
            c.setTimeInMillis(at);
            clock = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        }
        long next = AlarmPolicy.nextDaily(at, clock / 60, clock % 60, now, tz);
        if (next != at) p.edit().putLong(AT, next).commit();
        return next;
    }

    static synchronized void clearAlarm(Context context) {
        prefs(context).edit().remove(AT).remove(WINDOW).remove(CLOCK).commit();
    }

    /** The stored alarm time, or AlarmPolicy.NONE. */
    static synchronized long alarmAt(Context context) {
        return prefs(context).getLong(AT, AlarmPolicy.NONE);
    }

    static synchronized int windowMin(Context context) {
        return prefs(context).getInt(WINDOW, 0);
    }

    static synchronized void addDismissal(Context context, long dismissedAt, long alarmAt) {
        SharedPreferences p = prefs(context);
        p.edit().putString(DISMISSALS, AlarmPolicy.appendDismissal(p.getString(DISMISSALS, ""), dismissedAt, alarmAt)).commit();
    }

    /** Returns the stored dismissals and removes them, so each reaches JS once. */
    static synchronized List<long[]> takeDismissals(Context context) {
        SharedPreferences p = prefs(context);
        List<long[]> all = AlarmPolicy.parseDismissals(p.getString(DISMISSALS, ""));
        p.edit().remove(DISMISSALS).commit();
        return all;
    }
}
