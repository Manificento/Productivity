package com.manificento.lifeos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import java.util.Calendar;

/**
 * The ringing alarm over the lock screen (#233): the alarm time and a large «Выключить». Switching off goes through
 * AlarmRingingService exactly as the notification action, so the dismissal reaches JS (alarm:dismissed). Closes
 * itself when the ringing stops some other way (notification, timeout). The phone stays locked.
 */
public class AlarmActivity extends AppCompatActivity {

    static final String EXTRA_ALARM_AT = "alarmAt";

    private final BroadcastReceiver stopped = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            finish();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_alarm);

        long at = getIntent().getLongExtra(EXTRA_ALARM_AT, System.currentTimeMillis());
        Calendar time = Calendar.getInstance();
        time.setTimeInMillis(at);
        ((TextView) findViewById(R.id.alarm_time)).setText(
            AlarmPolicy.clockLabel(time.get(Calendar.HOUR_OF_DAY), time.get(Calendar.MINUTE))
        );
        Button dismiss = findViewById(R.id.alarm_dismiss);
        dismiss.setOnClickListener(v -> {
            startService(new Intent(this, AlarmRingingService.class).setAction(AlarmRingingService.ACTION_DISMISS));
            finish();
        });
        // Back does not silence the alarm by accident: only «Выключить» does.
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {}
            }
        );
        ContextCompat.registerReceiver(
            this,
            stopped,
            new IntentFilter(AlarmRingingService.ACTION_STOPPED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!AlarmRingingService.ringingNow) finish();
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(stopped);
        super.onDestroy();
    }
}
