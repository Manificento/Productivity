package com.manificento.lifeos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.content.ContextCompat;

/**
 * The alarm time came (also with the app closed): start the ringing service. After a reboot or an app update
 * AlarmManager has forgotten the alarm: set the stored one again (its next daily ring) — already before the first
 * unlock (LOCKED_BOOT_COMPLETED; the store lives in device-protected storage).
 */
public class AlarmReceiver extends BroadcastReceiver {

    static final String ACTION_RING = "com.manificento.lifeos.ALARM_RING";
    /** The clock; tests fix it (CLAUDE.md rule 7). */
    static java.util.function.LongSupplier clock = System::currentTimeMillis;

    static long now() {
        return clock.getAsLong();
    }
    private static final String TAG = "AlarmReceiver";
    /** Keeps the CPU awake between onReceive and the service taking its own lock. */
    private static final long HANDOFF_WAKE_MS = 30_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_RING.equals(action)) {
            long at = AlarmStore.alarmAt(context);
            int windowMin = AlarmStore.windowMin(context);
            long now = now();
            if (at != AlarmPolicy.NONE && windowMin > 0 && now < at && waitForLightSleep(context, now, at)) return;
            Intent ring = new Intent(context, AlarmRingingService.class)
                .setAction(AlarmRingingService.ACTION_RING)
                .putExtra(AlarmRingingService.EXTRA_ALARM_AT, at == AlarmPolicy.NONE ? System.currentTimeMillis() : at);
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LifeOS:AlarmHandoff").acquire(HANDOFF_WAKE_MS);
            try {
                // Allowed from the background: the app was woken by its own exact alarm clock.
                ContextCompat.startForegroundService(context, ring);
            } catch (RuntimeException e) {
                Log.e(TAG, "could not start ringing", e);
            }
            return;
        }
        if (
            Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
        ) {
            // Daily: a ring missed while the phone was off moves to the next day at the same time.
            long at = AlarmStore.rollDaily(context, now(), java.util.TimeZone.getDefault());
            if (!AlarmPolicy.shouldRestore(at)) return;
            try {
                AlarmScheduler.scheduleWindow(context, at, AlarmStore.windowMin(context));
            } catch (SecurityException e) {
                Log.e(TAG, "exact alarms are off: the alarm is not restored", e);
            }
        }
    }

    /**
     * Inside the wake window (#250): in deep sleep, check again in a minute (never past `at`) and return true; ring now
     * (false) in light sleep or when there are no readings — e.g. sensing off or the phone not unlocked since a restart.
     */
    private static boolean waitForLightSleep(Context context, long now, long at) {
        java.util.List<String> lines;
        try {
            lines = NightSampleStore.lines(context);
        } catch (RuntimeException e) {
            lines = java.util.Collections.emptyList();
        }
        if (SmartWake.decide(lines, now, at) == SmartWake.Decision.RING) return false;
        try {
            AlarmScheduler.schedule(context, SmartWake.nextCheck(now, at));
            return true;
        } catch (SecurityException e) {
            Log.e(TAG, "exact alarms are off: ringing now", e);
            return false;
        }
    }
}
