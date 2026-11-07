package com.manificento.lifeos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.widget.Button;
import android.widget.TextView;
import java.util.Calendar;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;

/** The alarm screen over the lock screen (#233), on the JVM with Robolectric. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class AlarmScreenTest {

    private static final long ALARM_AT = alarmAt(7, 5);
    private Application app;

    private static long alarmAt(int hour, int minute) {
        Calendar c = Calendar.getInstance();
        c.set(2026, Calendar.NOVEMBER, 8, hour, minute, 0);
        return c.getTimeInMillis();
    }

    @Before
    public void setUp() {
        app = RuntimeEnvironment.getApplication();
        AlarmStore.takeDismissals(app);
    }

    @After
    public void tearDown() {
        AlarmRingingService.ringing = false;
    }

    private ServiceController<AlarmRingingService> ring() {
        Intent intent = new Intent(app, AlarmRingingService.class)
            .setAction(AlarmRingingService.ACTION_RING)
            .putExtra(AlarmRingingService.EXTRA_ALARM_AT, ALARM_AT);
        return Robolectric.buildService(AlarmRingingService.class, intent).create().startCommand(0, 1);
    }

    private AlarmActivity openScreen() {
        Intent intent = new Intent(app, AlarmActivity.class).putExtra(AlarmRingingService.EXTRA_ALARM_AT, ALARM_AT);
        return Robolectric.buildActivity(AlarmActivity.class, intent).setup().get();
    }

    @Test
    public void givenTheAlarmRingsOnALockedPhoneWhenTheScreenTurnsOnThenTheAlarmScreenOpensOverTheLockScreen() {
        ring();
        assertTrue(AlarmRingingService.ringing);
        NotificationManager manager = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        List<Notification> shown = shadowOf(manager).getAllNotifications();
        assertEquals(1, shown.size());
        Notification notification = shown.get(0);
        assertNotNull("full-screen intent", notification.fullScreenIntent);
        Intent target = shadowOf(notification.fullScreenIntent).getSavedIntent();
        assertEquals(AlarmActivity.class.getName(), target.getComponent().getClassName());
        assertEquals(ALARM_AT, target.getLongExtra(AlarmRingingService.EXTRA_ALARM_AT, 0));

        AlarmActivity screen = openScreen();
        assertTrue("show when locked", shadowOf(screen).getShowWhenLocked());
        assertTrue("turn screen on", shadowOf(screen).getTurnScreenOn());
        assertEquals("07:05", ((TextView) screen.findViewById(R.id.alarm_time)).getText().toString());
        Button dismiss = screen.findViewById(R.id.alarm_dismiss);
        assertEquals("Выключить", dismiss.getText().toString());
        float density = screen.getResources().getDisplayMetrics().density;
        assertTrue("button ≥ 44 dp", dismiss.getMinimumHeight() >= 44 * density);
    }

    @Test
    public void givenTheAlarmScreenWhenITapDismissThenRingingStopsAndTheDismissalIsStored() {
        ServiceController<AlarmRingingService> service = ring();
        AlarmActivity screen = openScreen();

        Button dismiss = screen.findViewById(R.id.alarm_dismiss);
        dismiss.performClick();
        assertTrue(screen.isFinishing());
        assertFalse("a double tap sends nothing more", dismiss.isEnabled());
        Intent sent = shadowOf(app).getNextStartedService();
        assertEquals(AlarmRingingService.ACTION_DISMISS, sent.getAction());

        // The service receives exactly what the notification action sends.
        service.withIntent(sent).startCommand(0, 2);
        service.withIntent(sent).startCommand(0, 3);
        assertFalse(AlarmRingingService.ringing);
        List<long[]> dismissals = AlarmStore.takeDismissals(app);
        assertEquals(1, dismissals.size());
        assertEquals(ALARM_AT, dismissals.get(0)[1]);
    }

    @Test
    public void theAlarmScreenClosesWhenNothingRings() {
        AlarmActivity screen = openScreen();
        assertTrue(screen.isFinishing());
    }
}
