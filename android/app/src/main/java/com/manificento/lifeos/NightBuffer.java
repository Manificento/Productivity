package com.manificento.lifeos;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure buffer policy for night samples (unit-tested): keep the newest lines, clear up to a minute. */
final class NightBuffer {

    /** Two nights of minutes. When JS has not cleared the buffer, the oldest lines go first. */
    static final int MAX_LINES = 2 * 24 * 60;

    private NightBuffer() {}

    /** `lines` plus `line`, without the oldest lines beyond `max`. */
    static List<String> append(List<String> lines, String line, int max) {
        List<String> result = new ArrayList<>(lines);
        result.add(line);
        int extra = result.size() - max;
        return extra > 0 ? new ArrayList<>(result.subList(extra, result.size())) : result;
    }

    /** Lines whose `minuteStart` is after `upTo` (and lines that cannot be read are dropped too). */
    static List<String> keepAfter(List<String> lines, long upTo) {
        List<String> result = new ArrayList<>();
        for (String line : lines) {
            Long start = minuteStart(line);
            if (start != null && start > upTo) result.add(line);
        }
        return result;
    }

    /** Lines are written by NightMinute.toJsonLine(), so the key is read without a JSON parser (pure JVM). */
    private static final Pattern MINUTE_START = Pattern.compile("^\\{\"minuteStart\":(-?\\d+),.*\\}$");

    static Long minuteStart(String line) {
        Matcher m = MINUTE_START.matcher(line);
        return m.matches() ? Long.valueOf(m.group(1)) : null;
    }
}
