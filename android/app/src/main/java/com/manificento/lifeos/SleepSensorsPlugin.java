package com.manificento.lifeos;

import android.Manifest;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Night sensing for sleep tracking (#140, ADR-0008). JS reaches it only through src/core/platform.ts
 * (startNightSensing / stopNightSensing / readNightSamples / clearNightSamples). checkPermissions() and
 * requestPermissions() come from Plugin and report the "microphone" alias.
 */
@CapacitorPlugin(
    name = "SleepSensors",
    permissions = { @Permission(alias = SleepSensorsPlugin.MICROPHONE, strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class SleepSensorsPlugin extends Plugin {

    static final String MICROPHONE = "microphone";

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState(MICROPHONE) != PermissionState.GRANTED) {
            call.reject("Microphone permission is required for night sensing", "DENIED");
            return;
        }
        try {
            ContextCompat.startForegroundService(getContext(), new Intent(getContext(), NightSensingService.class));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not start night sensing", "START_FAILED", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), NightSensingService.class));
        call.resolve();
    }

    @PluginMethod
    public void getSamples(PluginCall call) {
        JSObject result = new JSObject();
        result.put("samples", NightSampleStore.read(getContext()));
        call.resolve(result);
    }

    /** Removes the minutes with `minuteStart <= upTo`, so a minute written after the morning read is kept. */
    @PluginMethod
    public void clearSamples(PluginCall call) {
        Long upTo = call.getLong("upTo");
        if (upTo == null) {
            call.reject("upTo is required");
            return;
        }
        NightSampleStore.clearUpTo(getContext(), upTo);
        call.resolve();
    }

    @PluginMethod
    public void isActive(PluginCall call) {
        JSObject result = new JSObject();
        result.put("active", NightSensingService.active);
        call.resolve(result);
    }
}
