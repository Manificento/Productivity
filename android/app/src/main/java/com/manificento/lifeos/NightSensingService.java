package com.manificento.lifeos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Foreground service that listens to the accelerometer and the microphone level through the night and writes one
 * NightMinute per minute to NightSampleStore. Audio is reduced to a level on the fly and never stored. Started by
 * SleepSensorsPlugin from a user action while the app is in the foreground (Android 14+ allows a microphone service
 * only then); keeps running while the app is closed.
 */
public class NightSensingService extends Service implements SensorEventListener {

    private static final String TAG = "NightSensingService";
    private static final String CHANNEL_ID = "night_sensing";
    private static final int NOTIFICATION_ID = 4101;
    /** A night never needs more; the lock is released earlier on stop. */
    private static final long WAKE_LOCK_MS = 14 * 60 * NightMinute.MINUTE_MS;
    private static final int SAMPLE_RATE = 8000;
    /** 100 ms of audio per level reading. */
    private static final int CHUNK = SAMPLE_RATE / 10;

    /** Whether a night is being recorded right now (the OS may end the service; JS asks via the plugin). */
    static volatile boolean active;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable flushTask = this::flushAndReschedule;
    private SensorManager sensorManager;
    private PowerManager.WakeLock wakeLock;
    private Thread audioThread;
    private volatile boolean running;
    /** The current minute; guarded by `this` (sensor callbacks on main, audio on its own thread). */
    private NightMinute minute;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (running) return START_NOT_STICKY;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), foregroundType());
        } catch (RuntimeException e) {
            // E.g. the microphone permission was revoked between the plugin's check and here.
            Log.e(TAG, "could not start in the foreground", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        active = true;
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LifeOS:NightSensing");
        wakeLock.acquire(WAKE_LOCK_MS);

        synchronized (this) {
            minute = new NightMinute(System.currentTimeMillis());
        }
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        Sensor accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelerometer != null) sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL);
        else Log.w(TAG, "no accelerometer: movement stays null");
        audioThread = new Thread(this::listenToNoise, "night-noise");
        audioThread.start();
        scheduleFlush();
        // Not sticky: Android may not restart a microphone service from the background; the user starts it again.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        active = false;
        handler.removeCallbacks(flushTask);
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (audioThread != null) {
            try {
                audioThread.join(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        flush();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        synchronized (this) {
            if (minute != null) minute.addAcceleration(event.values[0], event.values[1], event.values[2]);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    /** Reads the microphone in 100 ms chunks and keeps only their level; gives up (noise stays null) on errors. */
    private void listenToNoise() {
        int minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioRecord recorder;
        try {
            // VOICE_RECOGNITION: no automatic gain control, so night levels are not flattened.
            recorder = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minBuffer, CHUNK * 2)
            );
        } catch (SecurityException | IllegalArgumentException e) {
            Log.e(TAG, "microphone unavailable, movement only", e);
            return;
        }
        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "microphone did not initialize, movement only");
            recorder.release();
            return;
        }
        short[] buffer = new short[CHUNK];
        try {
            recorder.startRecording();
            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                Log.e(TAG, "microphone busy, movement only");
                return;
            }
            while (running) {
                int read = recorder.read(buffer, 0, buffer.length);
                if (read < 0) {
                    // ERROR_DEAD_OBJECT / ERROR_INVALID_OPERATION return at once: retrying would spin all night.
                    Log.e(TAG, "microphone read failed (" + read + "), movement only");
                    break;
                }
                if (read == 0) continue;
                double power = NightMinute.power(buffer, read);
                synchronized (this) {
                    if (minute != null) minute.addNoisePower(power);
                }
            }
        } catch (IllegalStateException e) {
            Log.e(TAG, "microphone stopped", e);
        } finally {
            try {
                recorder.stop();
            } catch (IllegalStateException ignored) {
                // Never started.
            }
            recorder.release();
        }
    }

    private void scheduleFlush() {
        handler.postDelayed(flushTask, NightMinute.msUntilNextMinute(System.currentTimeMillis()));
    }

    private void flushAndReschedule() {
        long now = System.currentTimeMillis();
        boolean over;
        synchronized (this) {
            over = minute == null || minute.isOver(now);
        }
        // Fired early by the wall clock: wait for the real boundary instead of shifting every later label.
        if (over) flush();
        if (running) scheduleFlush();
    }

    /** Writes the current minute (skipped when nothing was read) and starts the next one. */
    private void flush() {
        String line;
        synchronized (this) {
            if (minute == null) return;
            line = minute.toJsonLine();
            minute.next(System.currentTimeMillis());
        }
        if (line != null) NightSampleStore.append(this, line);
    }

    private static int foregroundType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0;
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Трекинг сна", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Пока идёт трекинг сна");
            manager.createNotificationChannel(channel);
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Трекинг сна")
            .setContentText("Записываю движение и уровень шума. Звук не сохраняется.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) builder.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE));
        return builder.build();
    }
}
