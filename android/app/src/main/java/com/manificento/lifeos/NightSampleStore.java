package com.manificento.lifeos;

import android.content.Context;
import android.util.Log;
import com.getcapacitor.JSArray;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Buffer of minute aggregates (NightSample in src/core/types.ts): one JSON line per minute in the app's private
 * files, written by NightSensingService and read by JS in the morning. Never holds raw audio. The policy (newest
 * kept, clear up to a minute) is NightBuffer, unit-tested.
 */
final class NightSampleStore {

    private static final String TAG = "NightSampleStore";
    private static final String FILE = "night_samples.jsonl";
    /** Lines in the file; -1 until counted once (so appends do not re-read the file every minute). */
    private static int lineCount = -1;

    private NightSampleStore() {}

    private static File file(Context context) {
        return new File(context.getFilesDir(), FILE);
    }

    static synchronized void append(Context context, String line) {
        File f = file(context);
        if (lineCount < 0) lineCount = readLines(f).size();
        if (lineCount < NightBuffer.MAX_LINES) {
            try (FileWriter writer = new FileWriter(f, true)) {
                writer.write(line + "\n");
                lineCount++;
            } catch (IOException e) {
                Log.e(TAG, "append failed", e);
            }
            return;
        }
        // Full: drop the oldest minutes, keep the newest night.
        writeLines(f, NightBuffer.append(readLines(f), line, NightBuffer.MAX_LINES));
    }

    static synchronized JSArray read(Context context) {
        JSArray samples = new JSArray();
        for (String line : readLines(file(context))) {
            try {
                samples.put(new JSONObject(line));
            } catch (JSONException e) {
                // A line cut by a crash: skip it, JS validates the rest.
            }
        }
        return samples;
    }

    /** Removes the minutes up to and including `upTo`; minutes written after the morning read stay. */
    static synchronized void clearUpTo(Context context, long upTo) {
        File f = file(context);
        writeLines(f, NightBuffer.keepAfter(readLines(f), upTo));
    }

    private static List<String> readLines(File f) {
        List<String> lines = new ArrayList<>();
        if (!f.exists()) return lines;
        try (BufferedReader reader = new BufferedReader(new FileReader(f))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isEmpty()) lines.add(line);
            }
        } catch (IOException e) {
            Log.e(TAG, "read failed", e);
        }
        return lines;
    }

    private static void writeLines(File f, List<String> lines) {
        try (FileWriter writer = new FileWriter(f, false)) {
            for (String line : lines) writer.write(line + "\n");
            lineCount = lines.size();
        } catch (IOException e) {
            Log.e(TAG, "write failed", e);
            lineCount = -1;
        }
    }
}
