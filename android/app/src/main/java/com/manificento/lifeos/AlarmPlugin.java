package com.manificento.lifeos;

import android.Manifest;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The alarm (#139, ADR-0008). JS reaches it only through src/core/platform.ts (setAlarm / cancelAlarm /
 * onAlarmDismissed). AlarmManager rings it as an alarm clock with the app closed; AlarmRingingService plays it.
 * The ringing alarm is a notification with «Выключить», so Android 13+ needs the notification permission.
 */
@CapacitorPlugin(
    name = "Alarm",
    permissions = { @Permission(alias = AlarmPlugin.NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class AlarmPlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";
    /** The running plugin, to tell JS about a dismissal at once; null while the app is closed. */
    private static volatile AlarmPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    /** Called by AlarmRingingService after it stored a dismissal: JS takes it with takeDismissals(). */
    static void notifyDismissed() {
        AlarmPlugin plugin = instance;
        if (plugin != null) plugin.notifyListeners("dismissed", new JSObject());
    }

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put(NOTIFICATIONS, notificationState().toString());
        call.resolve(result);
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationState() == PermissionState.GRANTED) {
            checkPermissions(call);
            return;
        }
        requestPermissionForAlias(NOTIFICATIONS, call, "notificationsAnswered");
    }

    @PermissionCallback
    private void notificationsAnswered(PluginCall call) {
        checkPermissions(call);
    }

    /** Before Android 13 there is no runtime permission: notifications are on unless switched off in settings. */
    private PermissionState notificationState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return NotificationManagerCompat.from(getContext()).areNotificationsEnabled()
                ? PermissionState.GRANTED
                : PermissionState.DENIED;
        }
        return getPermissionState(NOTIFICATIONS);
    }

    @PluginMethod
    public void set(PluginCall call) {
        // Any JSON number (a small value arrives as an Integer, which getLong() would not accept).
        if (!call.getData().has("at")) {
            call.reject("at is required");
            return;
        }
        long at = call.getData().optLong("at");
        int windowMin = call.getData().optInt("windowMin", 0);
        if (!AlarmPolicy.isValidWindow(windowMin)) {
            call.reject("windowMin must be 0…" + AlarmPolicy.MAX_WINDOW_MIN);
            return;
        }
        if (!AlarmScheduler.canScheduleExact(getContext())) {
            call.reject("Exact alarms are off", "EXACT_DENIED");
            return;
        }
        try {
            AlarmScheduler.scheduleWindow(getContext(), at, windowMin);
        } catch (SecurityException e) {
            call.reject("Exact alarms are off", "EXACT_DENIED", e);
            return;
        }
        AlarmStore.saveAlarm(getContext(), at, windowMin);
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        AlarmScheduler.cancel(getContext());
        AlarmStore.clearAlarm(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takeDismissals(PluginCall call) {
        JSArray dismissals = new JSArray();
        for (long[] d : AlarmStore.takeDismissals(getContext())) {
            JSObject item = new JSObject();
            item.put("dismissedAt", d[0]);
            item.put("alarmAt", d[1]);
            dismissals.put(item);
        }
        JSObject result = new JSObject();
        result.put("dismissals", dismissals);
        call.resolve(result);
    }
}
