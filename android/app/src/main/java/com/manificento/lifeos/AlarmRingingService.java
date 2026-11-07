package com.manificento.lifeos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Plays the alarm (alarm sound on the alarm stream + vibration) as a foreground service with a full-screen
 * notification and a «Выключить» action. Switching it off stores a dismissal for JS (alarm:dismissed) and tells a
 * running AlarmPlugin. Nobody switches it off within AlarmPolicy.RING_TIMEOUT_MS — it goes quiet (no dismissal).
 */
public class AlarmRingingService extends Service {

    static final String ACTION_RING = "com.manificento.lifeos.ALARM_PLAY";
    static final String ACTION_DISMISS = "com.manificento.lifeos.ALARM_DISMISS";
    static final String EXTRA_ALARM_AT = "alarmAt";
    /** Sent inside the app when the ringing stops (dismissed or timed out): AlarmActivity closes. */
    static final String ACTION_STOPPED = "com.manificento.lifeos.ALARM_STOPPED";

    /** Whether an alarm rings right now (AlarmActivity closes when it does not). */
    static volatile boolean ringing;

    private static final String TAG = "AlarmRingingService";
    private static final String CHANNEL_ID = "alarm";
    private static final int NOTIFICATION_ID = 4201;
    private static final long[] VIBRATION = { 0, 800, 600 };

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = this::stopSelf;
    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private long alarmAt;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_DISMISS.equals(action)) {
            dismiss();
            return START_NOT_STICKY;
        }
        long at = intent == null ? System.currentTimeMillis() : intent.getLongExtra(EXTRA_ALARM_AT, System.currentTimeMillis());
        if (ringing) {
            // A newer alarm came while this one rings (set less than 10 minutes ahead): keep ringing for it.
            alarmAt = at;
            scheduleTomorrow();
            // The notification and an open alarm screen show the new time.
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, buildNotification());
            handler.removeCallbacks(timeout);
            handler.postDelayed(timeout, AlarmPolicy.RING_TIMEOUT_MS);
            return START_NOT_STICKY;
        }
        alarmAt = at;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), foregroundType());
        } catch (RuntimeException e) {
            Log.e(TAG, "could not start in the foreground", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        ringing = true;
        // The alarm repeats daily (#241): the same time tomorrow, until cancelled or replaced.
        scheduleTomorrow();
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LifeOS:Alarm");
        wakeLock.acquire(AlarmPolicy.RING_TIMEOUT_MS + 5_000L);
        play();
        vibrate();
        handler.postDelayed(timeout, AlarmPolicy.RING_TIMEOUT_MS);
        return START_NOT_STICKY;
    }

    private void scheduleTomorrow() {
        // Rang inside the window, possibly before `at` (#250): tomorrow all the same, never today's window again.
        long rangUpTo = Math.max(System.currentTimeMillis(), AlarmStore.alarmAt(this));
        long next = AlarmStore.rollDaily(this, rangUpTo, java.util.TimeZone.getDefault());
        if (next == AlarmPolicy.NONE) return;
        try {
            AlarmScheduler.scheduleWindow(this, next, AlarmStore.windowMin(this));
        } catch (SecurityException e) {
            Log.e(TAG, "exact alarms are off: tomorrow's alarm is not set", e);
        }
    }

    private void dismiss() {
        if (ringing) {
            // A second «Выключить» before onDestroy (double tap) must not store a second dismissal.
            ringing = false;
            AlarmStore.addDismissal(this, System.currentTimeMillis(), alarmAt);
            AlarmPlugin.notifyDismissed();
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        ringing = false;
        sendBroadcast(new Intent(ACTION_STOPPED).setPackage(getPackageName()));
        handler.removeCallbacks(timeout);
        if (player != null) {
            try {
                player.stop();
            } catch (IllegalStateException e) {
                // not started
            }
            player.release();
            player = null;
        }
        if (vibrator != null) vibrator.cancel();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    private void play() {
        Uri sound = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (sound == null) return;
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            player.setDataSource(this, sound);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            // Vibration and the notification still wake the user.
            Log.e(TAG, "could not play the alarm sound", e);
        }
    }

    private void vibrate() {
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        vibrator.vibrate(
            VibrationEffect.createWaveform(VIBRATION, 0),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
        );
    }

    private static int foregroundType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Будильник", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Звонок будильника");
            // The service plays the sound itself on the alarm stream.
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }
        Intent dismiss = new Intent(this, AlarmRingingService.class).setAction(ACTION_DISMISS);
        PendingIntent dismissIntent = PendingIntent.getService(
            this,
            1,
            dismiss,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        // Over the lock screen: AlarmActivity with a large «Выключить». Android 14+ may withhold full-screen intents;
        // then the alarm rings as this notification (sound, vibration, «Выключить»).
        boolean fullScreen = AlarmPolicy.useFullScreen(Build.VERSION.SDK_INT, fullScreenGranted(manager));
        PendingIntent open = fullScreen ? alarmScreenIntent() : AlarmScheduler.showIntent(this);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Будильник")
            .setContentText("Пора вставать")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            // Android 14 lets the user swipe a foreground notification away: that switches the alarm off too.
            .setDeleteIntent(dismissIntent)
            // The «Выключить» action stays on a lock screen that hides sensitive content.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // Tapping the notification brings the alarm screen back (no unlock needed).
            .setContentIntent(open)
            .addAction(0, "Выключить", dismissIntent);
        if (fullScreen) builder.setFullScreenIntent(open, true);
        return builder.build();
    }

    private PendingIntent alarmScreenIntent() {
        Intent screen = new Intent(this, AlarmActivity.class)
            .putExtra(EXTRA_ALARM_AT, alarmAt)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        return PendingIntent.getActivity(this, 2, screen, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** The raw grant only; AlarmPolicy.useFullScreen decides (before Android 14 there is nothing to grant). */
    private static boolean fullScreenGranted(NotificationManager manager) {
        return Build.VERSION.SDK_INT >= 34 && manager.canUseFullScreenIntent();
    }
}
