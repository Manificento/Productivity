package com.manificento.lifeos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.content.ContextCompat;

/**
 * The alarm time came (also with the app closed): start the ringing service. After a reboot or an app update
 * AlarmManager has forgotten the alarm: set the stored one again if it is still ahead — already before the first
 * unlock (LOCKED_BOOT_COMPLETED; the store lives in device-protected storage).
 */
public class AlarmReceiver extends BroadcastReceiver {

    static final String ACTION_RING = "com.manificento.lifeos.ALARM_RING";
    private static final String TAG = "AlarmReceiver";
    /** Keeps the CPU awake between onReceive and the service taking its own lock. */
    private static final long HANDOFF_WAKE_MS = 30_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_RING.equals(action)) {
            long at = AlarmStore.alarmAt(context);
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
            long at = AlarmStore.alarmAt(context);
            if (!AlarmPolicy.shouldRestore(at, System.currentTimeMillis())) {
                AlarmStore.clearAlarm(context);
                return;
            }
            try {
                AlarmScheduler.schedule(context, at);
            } catch (SecurityException e) {
                Log.e(TAG, "exact alarms are off: the alarm is not restored", e);
            }
        }
    }
}
