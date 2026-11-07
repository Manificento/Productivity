package com.manificento.lifeos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/** The same synthetic nights as src/core/sleepPhases.test.ts (DEEP_THEN_STIR, STILL, RESTLESS): change both. */
public class SmartWakeTest {

    private static final long T0 = 1_794_074_400_000L;
    private static final long MIN = 60_000L;

    private static Double[] repeat(Double value, int n) {
        Double[] out = new Double[n];
        Arrays.fill(out, value);
        return out;
    }

    private static Double[] concat(Double[]... parts) {
        List<Double> all = new ArrayList<>();
        for (Double[] p : parts) all.addAll(Arrays.asList(p));
        return all.toArray(new Double[0]);
    }

    private static List<String> night(Double... movements) {
        List<String> lines = new ArrayList<>();
        for (int i = 0; i < movements.length; i++) {
            String m = movements[i] == null ? "null" : String.valueOf(movements[i]);
            lines.add("{\"minuteStart\":" + (T0 + i * MIN) + ",\"movement\":" + m + ",\"movementPeak\":" + m
                + ",\"noiseDb\":-60.0,\"noisePeakDb\":-50.0}");
        }
        return lines;
    }

    private static final Double[] DEEP_THEN_STIR = concat(repeat(0.01, 20), new Double[] { 0.08, 0.09, 0.1, 0.12, 0.1 });

    @Test
    public void givenTheRuleWhenCheckedThenLightSleepIsComingOutOfStillness() {
        assertTrue(SmartWake.isLightSleepAt(night(DEEP_THEN_STIR), T0 + 24 * MIN));
        assertFalse(SmartWake.isLightSleepAt(night(DEEP_THEN_STIR), T0 + 19 * MIN));
        assertFalse(SmartWake.isLightSleepAt(night(repeat(0.01, 25)), T0 + 24 * MIN));
        assertFalse(SmartWake.isLightSleepAt(night(repeat(0.2, 25)), T0 + 24 * MIN));
        assertFalse(SmartWake.isLightSleepAt(night(concat(repeat(0.01, 20), repeat(null, 5))), T0 + 24 * MIN));
        assertEquals(0.05, SmartWake.LIGHT_MIN_MOVEMENT, 0);
        assertEquals(1.5, SmartWake.RISE_FACTOR, 0);
    }

    @Test
    public void inTheWindowItRingsInLightSleepOrWithoutDataAndWaitsInDeepSleepUntilTheEnd() {
        long at = T0 + 40 * MIN;
        // Light sleep now: ring.
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(night(DEEP_THEN_STIR), T0 + 24 * MIN, at));
        // Deep sleep: check again in a minute.
        assertEquals(SmartWake.Decision.WAIT, SmartWake.decide(night(repeat(0.01, 25)), T0 + 24 * MIN, at));
        // No readings in the last minutes (sensing off): ring at once — the start of the window, as before.
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(new ArrayList<>(), T0 + 24 * MIN, at));
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(night(repeat(0.01, 10)), T0 + 24 * MIN, at));
        // The end of the window: ring whatever the phase.
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(night(repeat(0.01, 25)), at, at));
    }

    @Test
    public void readsTheMovementOfALine() {
        assertEquals(Double.valueOf(0.08), NightBuffer.movement(night(0.08).get(0)));
        assertNull(NightBuffer.movement(night((Double) null).get(0)));
        assertNull(NightBuffer.movement("not json"));
    }
}
