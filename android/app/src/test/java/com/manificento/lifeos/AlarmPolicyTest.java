package com.manificento.lifeos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

public class AlarmPolicyTest {

    @Test
    public void aDismissalIsStoredWithTheTimeTheAlarmWasSetFor() {
        String stored = AlarmPolicy.appendDismissal("", 1_000L, 900L);
        stored = AlarmPolicy.appendDismissal(stored, 2_000L, 1_900L);
        List<long[]> dismissals = AlarmPolicy.parseDismissals(stored);
        assertEquals(2, dismissals.size());
        assertArrayEquals(new long[] { 1_000L, 900L }, dismissals.get(0));
        assertArrayEquals(new long[] { 2_000L, 1_900L }, dismissals.get(1));
    }

    @Test
    public void onlyTheNewestDismissalsAreKeptWhileTheAppStaysClosed() {
        String stored = "";
        for (long i = 1; i <= AlarmPolicy.MAX_DISMISSALS + 5; i++) stored = AlarmPolicy.appendDismissal(stored, i, i);
        List<long[]> dismissals = AlarmPolicy.parseDismissals(stored);
        assertEquals(AlarmPolicy.MAX_DISMISSALS, dismissals.size());
        assertEquals(6L, dismissals.get(0)[0]);
    }

    @Test
    public void brokenEntriesAreSkipped() {
        List<long[]> dismissals = AlarmPolicy.parseDismissals("1:2;oops;3;4:x;5:6;");
        assertEquals(2, dismissals.size());
        assertArrayEquals(new long[] { 5L, 6L }, dismissals.get(1));
        assertTrue(AlarmPolicy.parseDismissals(null).isEmpty());
    }

    @Test
    public void afterARebootOnlyAnAlarmStillAheadIsRestored() {
        assertTrue(AlarmPolicy.shouldRestore(2_000L, 1_000L));
        assertFalse(AlarmPolicy.shouldRestore(1_000L, 1_000L));
        assertFalse(AlarmPolicy.shouldRestore(AlarmPolicy.NONE, 1_000L));
    }

    @Test
    public void theWindowIsWholeMinutesFromZeroToTwoHours() {
        assertTrue(AlarmPolicy.isValidWindow(0));
        assertTrue(AlarmPolicy.isValidWindow(120));
        assertFalse(AlarmPolicy.isValidWindow(-1));
        assertFalse(AlarmPolicy.isValidWindow(121));
    }

    @Test
    public void givenAndroid14WithoutFullScreenPermissionWhenTheAlarmRingsThenItRingsAsANotificationWithoutError() {
        assertFalse(AlarmPolicy.useFullScreen(34, false));
        assertTrue(AlarmPolicy.useFullScreen(34, true));
        // Before Android 14 the permission is granted at install.
        assertTrue(AlarmPolicy.useFullScreen(33, false));
        assertTrue(AlarmPolicy.useFullScreen(26, false));
    }

    @Test
    public void theAlarmScreenShowsTheTimeTheAlarmWasSetForAsHoursAndMinutes() {
        assertEquals("07:05", AlarmPolicy.clockLabel(7, 5));
        assertEquals("23:30", AlarmPolicy.clockLabel(23, 30));
    }
}
