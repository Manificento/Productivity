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
        long now = T0 + 25 * MIN + 5_000L; // minutes 0–24 are complete and written
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(night(DEEP_THEN_STIR), now, at));
        assertEquals(SmartWake.Decision.WAIT, SmartWake.decide(night(repeat(0.01, 25)), now, at));
        // No readings (sensing off): ring at once — the start of the window, as before.
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(new ArrayList<>(), now, at));
        // The end of the window: ring whatever the phase.
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(night(repeat(0.01, 25)), at, at));
    }

    @Test
    public void theMinuteThatJustEndedMayNotBeWrittenYetTheNewestWrittenOneDecides() {
        // The service has not flushed minute 24 yet: minute 23 already shows the stir.
        List<String> notFlushed = night(DEEP_THEN_STIR).subList(0, 24);
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(notFlushed, T0 + 25 * MIN, T0 + 40 * MIN));
    }

    @Test
    public void sensingThatStopsMidWindowRingsWithinFiveMinutes() {
        List<String> stopped = night(repeat(0.01, 25)); // last minute 24, ends at 25
        assertEquals(SmartWake.Decision.WAIT, SmartWake.decide(stopped, T0 + 30 * MIN, T0 + 60 * MIN));
        assertEquals(SmartWake.Decision.RING, SmartWake.decide(stopped, T0 + 30 * MIN + 1, T0 + 60 * MIN));
    }

    @Test
    public void checksRunJustAfterTheMinuteBoundaryAndNeverPastTheAlarm() {
        assertEquals(T0 + 26 * MIN + 5_000L, SmartWake.nextCheck(T0 + 25 * MIN + 5_000L, T0 + 40 * MIN));
        assertEquals(T0 + 40 * MIN, SmartWake.nextCheck(T0 + 39 * MIN + 30_000L, T0 + 40 * MIN));
    }

    @Test
    public void aWindowThatHasAlreadyBegunRingsAtTheAlarmTimeNotAtOnce() {
        long now = T0;
        assertEquals(T0 + 10 * MIN, SmartWake.firstFire(T0 + 40 * MIN, 30, now));
        // A nap alarm in 10 minutes with a 30-minute window: a plain alarm at its time.
        assertEquals(T0 + 10 * MIN, SmartWake.firstFire(T0 + 10 * MIN, 30, now));
        assertEquals(T0 + 10 * MIN, SmartWake.firstFire(T0 + 10 * MIN, 0, now));
    }

    @Test
    public void readsTheMovementOfALine() {
        assertEquals(Double.valueOf(0.08), NightBuffer.movement(night(0.08).get(0)));
        assertNull(NightBuffer.movement(night((Double) null).get(0)));
        assertNull(NightBuffer.movement("not json"));
    }
}
