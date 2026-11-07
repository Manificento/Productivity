package com.manificento.lifeos;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.List;

/** The one alarm (time and smart-wake window) and the dismissals JS has not taken yet, in private preferences. */
final class AlarmStore {

    private static final String PREFS = "lifeos_alarm";
    private static final String AT = "at";
    private static final String WINDOW = "windowMin";
    private static final String DISMISSALS = "dismissals";

    private AlarmStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void saveAlarm(Context context, long at, int windowMin) {
        prefs(context).edit().putLong(AT, at).putInt(WINDOW, windowMin).commit();
    }

    static synchronized void clearAlarm(Context context) {
        prefs(context).edit().remove(AT).remove(WINDOW).commit();
    }

    /** The stored alarm time, or AlarmPolicy.NONE. */
    static synchronized long alarmAt(Context context) {
        return prefs(context).getLong(AT, AlarmPolicy.NONE);
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
