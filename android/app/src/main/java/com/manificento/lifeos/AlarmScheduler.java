package com.manificento.lifeos;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Sets the alarm in AlarmManager as an alarm clock: exact, allowed in Doze, shown by the system as the next alarm. */
final class AlarmScheduler {

    private static final int REQUEST_RING = 4201;
    private static final int REQUEST_SHOW = 4202;

    private AlarmScheduler() {}

    /** Android 12+ may switch exact alarms off («Alarms & reminders»); USE_EXACT_ALARM keeps them on from 13. */
    static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return alarmManager(context).canScheduleExactAlarms();
    }

    /** Replaces any earlier alarm (same PendingIntent). Throws SecurityException if exact alarms are not allowed. */
    static void schedule(Context context, long at) {
        alarmManager(context).setAlarmClock(new AlarmManager.AlarmClockInfo(at, showIntent(context)), ringIntent(context));
    }

    /**
     * Sets the alarm for its wake window: the first fire at its start (`at` − `windowMin`); with a window the receiver
     * then checks for light sleep every minute until `at` (#250). Throws SecurityException like schedule().
     */
    static void scheduleWindow(Context context, long at, int windowMin) {
        schedule(context, at - windowMin * 60_000L);
    }

    static void cancel(Context context) {
        alarmManager(context).cancel(ringIntent(context));
    }

    private static AlarmManager alarmManager(Context context) {
        return (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    }

    private static PendingIntent ringIntent(Context context) {
        Intent intent = new Intent(context, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_RING);
        return PendingIntent.getBroadcast(
            context,
            REQUEST_RING,
            intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
    }

    /** Opens LifeOS (its launcher activity). */
    static Intent openAppIntent(Context context) {
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        return open != null ? open : new Intent(context, MainActivity.class);
    }

    /** What the system opens when the user taps the next alarm in the status bar or quick settings. */
    static PendingIntent showIntent(Context context) {
        Intent open = openAppIntent(context);
        return PendingIntent.getActivity(
            context,
            REQUEST_SHOW,
            open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
    }
}
