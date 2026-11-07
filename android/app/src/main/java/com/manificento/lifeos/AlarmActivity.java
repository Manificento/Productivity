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
 * AlarmRingingService exactly as the notification action, so the dismissal reaches JS (alarm:dismissed), then opens
 * LifeOS, where «Сон» offers to log the night (#241). Closes
 * itself when the ringing stops some other way (notification, timeout). The phone stays locked.
 */
public class AlarmActivity extends AppCompatActivity {

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

        showTime(getIntent());
        Button dismiss = findViewById(R.id.alarm_dismiss);
        dismiss.setOnClickListener(v -> {
            v.setEnabled(false);
            startService(new Intent(this, AlarmRingingService.class).setAction(AlarmRingingService.ACTION_DISMISS));
            // Straight to LifeOS (after unlocking): «Сон» offers to log the night (#241).
            startActivity(AlarmScheduler.openAppIntent(this).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
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

    /** A newer alarm while this one rings: the screen shows its time. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        showTime(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!AlarmRingingService.ringing) finish();
    }

    private void showTime(Intent intent) {
        long at = intent.getLongExtra(AlarmRingingService.EXTRA_ALARM_AT, System.currentTimeMillis());
        Calendar time = Calendar.getInstance();
        time.setTimeInMillis(at);
        ((TextView) findViewById(R.id.alarm_time)).setText(
            AlarmPolicy.clockLabel(time.get(Calendar.HOUR_OF_DAY), time.get(Calendar.MINUTE))
        );
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(stopped);
        super.onDestroy();
    }
}
