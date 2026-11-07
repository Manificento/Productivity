package com.manificento.lifeos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;
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

    private static long berlin(int year, int month, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Berlin"));
        c.clear();
        c.set(year, month - 1, day, hour, minute, 0);
        return c.getTimeInMillis();
    }

    @Test
    public void givenTheAlarmRangWhenItIsSwitchedOffThenTheNextRingIsTheSameTimeTomorrow() {
        TimeZone tz = TimeZone.getTimeZone("Europe/Berlin");
        long at = berlin(2026, 11, 8, 6, 30);
        assertEquals(berlin(2026, 11, 9, 6, 30), AlarmPolicy.nextDaily(at, 6, 30, at + 60_000L, tz));
        // Still ahead: unchanged.
        assertEquals(at, AlarmPolicy.nextDaily(at, 6, 30, at - 1L, tz));
        // The phone was off for days: the first ring still ahead, at the same local time.
        assertEquals(berlin(2026, 11, 12, 6, 30), AlarmPolicy.nextDaily(at, 6, 30, berlin(2026, 11, 11, 7, 0), tz));
    }

    @Test
    public void aDailyAlarmKeepsItsLocalTimeAcrossTheClockChange() {
        TimeZone tz = TimeZone.getTimeZone("Europe/Berlin");
        // 25 Oct 2026: clocks go back an hour; the day is 25 hours long.
        long at = berlin(2026, 10, 24, 7, 0);
        assertEquals(berlin(2026, 10, 25, 7, 0), AlarmPolicy.nextDaily(at, 7, 0, at + 1L, tz));
    }

    @Test
    public void aRingMovedByTheSpringGapComesBackToItsClockTimeTheNextDay() {
        TimeZone tz = TimeZone.getTimeZone("Europe/Berlin");
        // 28 Mar 2027: 02:00–03:00 does not exist; a 02:30 ring that day happens at 03:30.
        long shifted = berlin(2027, 3, 28, 3, 30);
        assertEquals(berlin(2027, 3, 29, 2, 30), AlarmPolicy.nextDaily(shifted, 2, 30, shifted + 1L, tz));
    }

    @Test
    public void afterARebootTheStoredAlarmIsRestoredUnlessThereIsNone() {
        assertTrue(AlarmPolicy.shouldRestore(2_000L));
        assertFalse(AlarmPolicy.shouldRestore(AlarmPolicy.NONE));
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
