package com.manificento.lifeos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class NightBufferTest {

    private static String line(long start) {
        return "{\"minuteStart\":" + start + ",\"movement\":0.1,\"movementPeak\":0.2,\"noiseDb\":-60.0,\"noisePeakDb\":-50.0}";
    }

    @Test
    public void whenFullTheOldestLinesGoAndTheNewestStay() {
        List<String> lines = Arrays.asList(line(1), line(2), line(3));
        assertEquals(Arrays.asList(line(2), line(3), line(4)), NightBuffer.append(lines, line(4), 3, 0));
        assertEquals(Arrays.asList(line(1), line(2), line(3), line(4)), NightBuffer.append(lines, line(4), 5, 2));
    }

    @Test
    public void whenFullSeveralOldestLinesGoAtOnceSoTheFileIsNotRewrittenEveryMinute() {
        List<String> lines = Arrays.asList(line(1), line(2), line(3), line(4));
        assertEquals(Arrays.asList(line(4), line(5)), NightBuffer.append(lines, line(5), 4, 2));
        assertEquals(Arrays.asList(line(5)), NightBuffer.append(lines, line(5), 4, 10));
    }

    @Test
    public void clearingUpToAMinuteKeepsTheMinutesWrittenAfterTheRead() {
        List<String> lines = Arrays.asList(line(60_000), line(120_000), line(180_000), "{broken");
        assertEquals(Arrays.asList(line(180_000)), NightBuffer.keepAfter(lines, 120_000));
    }

    @Test
    public void readsTheMinuteStartOfALine() {
        assertEquals(Long.valueOf(60_000), NightBuffer.minuteStart(line(60_000)));
        assertNull(NightBuffer.minuteStart("{\"movement\":1}"));
        assertNull(NightBuffer.minuteStart("not json"));
    }
}
