package com.manificento.lifeos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NightMinuteTest {

    private static final long T = 1_794_000_000_000L; // a whole minute, epoch ms

    @Test
    public void startsAtTheMinuteBoundaryAndCountsToTheNextOne() {
        assertEquals(T, new NightMinute(T + 12_345).start());
        assertEquals(60_000 - 12_345, NightMinute.msUntilNextMinute(T + 12_345));
        assertEquals(60_000, NightMinute.msUntilNextMinute(T));
    }

    @Test
    public void anEmptyMinuteIsNotWritten() {
        assertNull(new NightMinute(T).toJsonLine());
    }

    @Test
    public void movementIsTheChangeOfTheAccelerationVectorSoTurningOverCounts() {
        NightMinute m = new NightMinute(T);
        m.addAcceleration(0, 0, 9.8f); // reference only
        m.addAcceleration(9.8f, 0, 0); // turned on the side: same magnitude, other direction
        m.addAcceleration(9.8f, 0, 0); // still
        // Deltas: 13.859 and 0 → mean 6.9296, peak 13.8593.
        assertEquals(
            "{\"minuteStart\":" + T + ",\"movement\":6.9296,\"movementPeak\":13.8593,\"noiseDb\":null,\"noisePeakDb\":null}",
            m.toJsonLine()
        );
    }

    @Test
    public void noiseIsMeanPowerAndPeakInDbfsAndMissingMovementIsNull() {
        NightMinute m = new NightMinute(T);
        m.addNoisePower(0.0001); // −40 dBFS
        m.addNoisePower(0.01); // −20 dBFS
        assertEquals(
            "{\"minuteStart\":" + T + ",\"movement\":null,\"movementPeak\":null,\"noiseDb\":-23.0,\"noisePeakDb\":-20.0}",
            m.toJsonLine()
        );
    }

    @Test
    public void levelsAreClampedToMinus90To0() {
        assertEquals(-90, NightMinute.toDb(0), 0);
        assertEquals(-90, NightMinute.toDb(1e-12), 0);
        assertEquals(0, NightMinute.toDb(2), 0);
        assertEquals(-90, NightMinute.toDb(Double.NaN), 0);
    }

    @Test
    public void powerOfPcmIsRelativeToFullScale() {
        short[] full = { Short.MIN_VALUE, Short.MIN_VALUE };
        assertEquals(1.0, NightMinute.power(full, 2), 1e-9);
        assertEquals(0, NightMinute.power(new short[4], 4), 0);
        assertEquals(0, NightMinute.power(full, 0), 0);
    }

    @Test
    public void nextMinuteResetsAndNeverGoesBackWhenTheClockIsMovedBack() {
        NightMinute m = new NightMinute(T);
        m.addNoisePower(0.01);
        m.next(T + 59_900); // the flush fired a moment early by the wall clock
        assertEquals(T + 60_000, m.start());
        assertTrue(m.isEmpty());
        m.next(T + 5 * 60_000 + 10); // the phone slept: the next sample starts at the real minute
        assertEquals(T + 5 * 60_000, m.start());
    }
}
