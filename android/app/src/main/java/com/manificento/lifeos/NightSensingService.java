package com.manificento.lifeos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
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
 * aggregate per minute to NightSampleStore. Audio is reduced to a level in dBFS on the fly and never stored.
 * Started and stopped by SleepSensorsPlugin; keeps running while the app is closed.
 */
public class NightSensingService extends Service implements SensorEventListener {

    private static final String TAG = "NightSensingService";
    private static final String CHANNEL_ID = "night_sensing";
    private static final int NOTIFICATION_ID = 4101;
    private static final long MINUTE_MS = 60_000L;
    /** A night never needs more; the lock is released earlier on stop. */
    private static final long WAKE_LOCK_MS = 14 * 60 * MINUTE_MS;
    private static final int SAMPLE_RATE = 8000;
    /** 100 ms of audio per level reading. */
    private static final int CHUNK = SAMPLE_RATE / 10;
    private static final double SILENCE_DB = -90;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable flushTask = this::flushAndReschedule;
    private SensorManager sensorManager;
    private PowerManager.WakeLock wakeLock;
    private Thread audioThread;
    private volatile boolean running;

    // Accumulators of the current minute, guarded by `this`.
    private long minuteStart;
    private double movementSum;
    private int movementCount;
    private float lastMagnitude = -1;
    private double powerSum;
    private int powerCount;
    private double peakDb = SILENCE_DB;

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
            // E.g. the microphone permission was revoked: a microphone service may not start without it.
            Log.e(TAG, "could not start in the foreground", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LifeOS:NightSensing");
        wakeLock.acquire(WAKE_LOCK_MS);

        synchronized (this) {
            minuteStart = System.currentTimeMillis() / MINUTE_MS * MINUTE_MS;
        }
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        Sensor accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelerometer != null) sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL);
        audioThread = new Thread(this::listenToNoise, "night-noise");
        audioThread.start();
        scheduleFlush();
        // Not sticky: Android may not restart a microphone service from the background, the user starts it again.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacks(flushTask);
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (audioThread != null) {
            try {
                audioThread.join(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        flush(false);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float x = event.values[0], y = event.values[1], z = event.values[2];
        float magnitude = (float) Math.sqrt(x * x + y * y + z * z);
        synchronized (this) {
            if (lastMagnitude >= 0) {
                movementSum += Math.abs(magnitude - lastMagnitude);
                movementCount++;
            }
            lastMagnitude = magnitude;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    /** Reads the microphone in 100 ms chunks and keeps only their level. */
    private void listenToNoise() {
        int minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioRecord recorder;
        try {
            recorder = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
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
            recorder.release();
            return;
        }
        short[] buffer = new short[CHUNK];
        try {
            recorder.startRecording();
            while (running) {
                int read = recorder.read(buffer, 0, buffer.length);
                if (read <= 0) continue;
                double sumSquares = 0;
                for (int i = 0; i < read; i++) {
                    double s = buffer[i] / 32768.0;
                    sumSquares += s * s;
                }
                double power = sumSquares / read;
                synchronized (this) {
                    powerSum += power;
                    powerCount++;
                    peakDb = Math.max(peakDb, toDb(power));
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
        long now = System.currentTimeMillis();
        long nextMinute = (now / MINUTE_MS + 1) * MINUTE_MS;
        handler.postDelayed(flushTask, nextMinute - now);
    }

    private void flushAndReschedule() {
        flush(true);
        if (running) scheduleFlush();
    }

    /** Writes the current minute's aggregate (skipped when nothing was read) and starts the next minute. */
    private void flush(boolean minuteEnded) {
        long start;
        double movement, noiseDb, noisePeak;
        boolean empty;
        synchronized (this) {
            start = minuteStart;
            empty = movementCount == 0 && powerCount == 0;
            movement = movementCount > 0 ? movementSum / movementCount : 0;
            noiseDb = powerCount > 0 ? toDb(powerSum / powerCount) : SILENCE_DB;
            noisePeak = peakDb;
            minuteStart = minuteEnded ? System.currentTimeMillis() / MINUTE_MS * MINUTE_MS : minuteStart;
            movementSum = 0;
            movementCount = 0;
            powerSum = 0;
            powerCount = 0;
            peakDb = SILENCE_DB;
        }
        if (!empty) NightSampleStore.append(this, start, movement, noiseDb, noisePeak);
    }

    private static double toDb(double power) {
        if (power <= 0) return SILENCE_DB;
        return Math.max(SILENCE_DB, Math.min(0, 10 * Math.log10(power)));
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
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Трекинг сна")
            .setContentText("Записываю движение и уровень шума. Звук не сохраняется.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (open != null) {
            builder.setContentIntent(
                android.app.PendingIntent.getActivity(this, 0, open, android.app.PendingIntent.FLAG_IMMUTABLE)
            );
        }
        return builder.build();
    }
}
