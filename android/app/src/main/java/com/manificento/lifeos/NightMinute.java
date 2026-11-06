package com.manificento.lifeos;

import java.util.Locale;

/**
 * Pure accumulator of one minute of night sensing (no Android types, unit-tested): movement as the change of the
 * acceleration vector between readings, noise as mean power and peak in dBFS. A field without readings is null —
 * "no data" must never look like "lying still" or "silence" (NightSample in src/core/types.ts).
 */
final class NightMinute {

    static final long MINUTE_MS = 60_000L;
    static final double SILENCE_DB = -90;

    private long start;
    private double movementSum;
    private double movementMax;
    private int movementCount;
    private float[] last;
    private double powerSum;
    private double peakDb = SILENCE_DB;
    private int powerCount;

    NightMinute(long nowMs) {
        start = floorMinute(nowMs);
    }

    static long floorMinute(long ms) {
        return ms / MINUTE_MS * MINUTE_MS;
    }

    /** Wall-clock delay until the next minute boundary, ms (always > 0). */
    static long msUntilNextMinute(long nowMs) {
        return floorMinute(nowMs) + MINUTE_MS - nowMs;
    }

    static double toDb(double power) {
        if (!(power > 0)) return SILENCE_DB;
        return Math.max(SILENCE_DB, Math.min(0, 10 * Math.log10(power)));
    }

    long start() {
        return start;
    }

    /** Whether the minute is over by the wall clock (a handler timer may fire a moment early). */
    boolean isOver(long nowMs) {
        return nowMs >= start + MINUTE_MS;
    }

    /** One accelerometer reading, m/s². The first reading of the night only sets the reference. */
    void addAcceleration(float x, float y, float z) {
        if (last != null) {
            double dx = x - last[0], dy = y - last[1], dz = z - last[2];
            double delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
            movementSum += delta;
            movementMax = Math.max(movementMax, delta);
            movementCount++;
        }
        last = new float[] { x, y, z };
    }

    /** Mean power (0…1, full scale = 1) of one chunk of 16-bit PCM; the samples themselves are not kept. */
    static double power(short[] pcm, int length) {
        double sumSquares = 0;
        for (int i = 0; i < length; i++) {
            double s = pcm[i] / 32768.0;
            sumSquares += s * s;
        }
        return length > 0 ? sumSquares / length : 0;
    }

    void addNoisePower(double power) {
        powerSum += power;
        powerCount++;
        peakDb = Math.max(peakDb, toDb(power));
    }

    boolean isEmpty() {
        return movementCount == 0 && powerCount == 0;
    }

    /** The minute as one JSON line (NightSample), or null when nothing was read. */
    String toJsonLine() {
        if (isEmpty()) return null;
        String movement = movementCount > 0 ? String.format(Locale.ROOT, "%.4f", movementSum / movementCount) : "null";
        String movementPeak = movementCount > 0 ? String.format(Locale.ROOT, "%.4f", movementMax) : "null";
        String noise = powerCount > 0 ? String.format(Locale.ROOT, "%.1f", toDb(powerSum / powerCount)) : "null";
        String noisePeak = powerCount > 0 ? String.format(Locale.ROOT, "%.1f", peakDb) : "null";
        return String.format(
            Locale.ROOT,
            "{\"minuteStart\":%d,\"movement\":%s,\"movementPeak\":%s,\"noiseDb\":%s,\"noisePeakDb\":%s}",
            start,
            movement,
            movementPeak,
            noise,
            noisePeak
        );
    }

    /**
     * Starts the next minute. Never goes back: if the wall clock moved back a little, the next minute still
     * follows this one, so two samples never share a `minuteStart`.
     */
    void next(long nowMs) {
        start = Math.max(start + MINUTE_MS, floorMinute(nowMs));
        movementSum = 0;
        movementMax = 0;
        movementCount = 0;
        powerSum = 0;
        powerCount = 0;
        peakDb = SILENCE_DB;
    }
}
