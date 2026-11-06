package com.manificento.lifeos;

import android.content.Context;
import android.util.Log;
import com.getcapacitor.JSArray;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Buffer of minute aggregates (NightSample in src/core/types.ts): one JSON object per line in the app's
 * private files, written by NightSensingService and read by JS in the morning. Never holds raw audio.
 */
final class NightSampleStore {

    private static final String TAG = "NightSampleStore";
    private static final String FILE = "night_samples.jsonl";
    /** Two nights of minutes: if JS never clears the buffer, the newest are kept out of an unbounded file. */
    private static final int MAX_LINES = 2 * 24 * 60;

    private NightSampleStore() {}

    private static File file(Context context) {
        return new File(context.getFilesDir(), FILE);
    }

    static synchronized void append(Context context, long minuteStart, double movement, double noiseDb, double noisePeakDb) {
        File f = file(context);
        if (countLines(f) >= MAX_LINES) return;
        String line = String.format(
            Locale.ROOT,
            "{\"minuteStart\":%d,\"movement\":%.4f,\"noiseDb\":%.1f,\"noisePeakDb\":%.1f}\n",
            minuteStart,
            movement,
            noiseDb,
            noisePeakDb
        );
        try (FileWriter writer = new FileWriter(f, true)) {
            writer.write(line);
        } catch (IOException e) {
            Log.e(TAG, "append failed", e);
        }
    }

    static synchronized JSArray read(Context context) {
        JSArray samples = new JSArray();
        File f = file(context);
        if (!f.exists()) return samples;
        try (BufferedReader reader = new BufferedReader(new FileReader(f))) {
            String line;
            while ((line = reader.readLine()) != null) {
                try {
                    samples.put(new JSONObject(line));
                } catch (JSONException e) {
                    // A line cut by a crash: skip it, JS validates the rest.
                }
            }
        } catch (IOException e) {
            Log.e(TAG, "read failed", e);
        }
        return samples;
    }

    static synchronized void clear(Context context) {
        File f = file(context);
        if (f.exists() && !f.delete()) Log.w(TAG, "could not delete the buffer");
    }

    private static int countLines(File f) {
        if (!f.exists()) return 0;
        int lines = 0;
        try (BufferedReader reader = new BufferedReader(new FileReader(f))) {
            while (reader.readLine() != null) lines++;
        } catch (IOException e) {
            Log.e(TAG, "count failed", e);
        }
        return lines;
    }
}
