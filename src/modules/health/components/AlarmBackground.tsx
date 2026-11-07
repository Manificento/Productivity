import { useEffect, useMemo, useRef } from 'react';
import { useDailyTargetsRange } from '../../../core/adaptation/useDailyTargets';
import { shiftDateKey, useTodayKey } from '../../../core/dates';
import { getCapabilities, onAlarmDismissed } from '../../../core/platform';
import type { DateKey } from '../../../core/types';
import { keepArmed, recordDismissal, useAlarmState } from '../data/alarm';
import { nextAlarm, type WakeTargets } from '../logic/alarm';

/** Shortly after the set alarm time: it has rung, set the next one even if nothing else happens. */
const AFTER_RING_MS = 60_000;

/**
 * Mounted by the shell on every page (#129). The native alarm rings once, so while it is on this sets the next wake
 * window's alarm: when the app starts (always — the stored state may outlive the native alarm), when the alarm is
 * switched off, when the app comes back to the screen, and a minute after the set time. A day without opening
 * LifeOS leaves the last alarm as it was (a repeating native alarm — #241). Stores a switch-off for «Я встал».
 */
export function AlarmBackground() {
  return getCapabilities().alarms ? <AlarmKeeper /> : null;
}

function parseWindows(digest: string): Map<DateKey, WakeTargets> {
  return new Map(
    digest
      .split(',')
      .filter(Boolean)
      .map((w) => {
        const [date = '', wakeTime = '', min = '0'] = w.split('|');
        return [date, { wakeTime, wakeWindowMin: Number(min) }];
      }),
  );
}

function AlarmKeeper() {
  const today = useTodayKey();
  // Two days ahead: the process may outlive midnight before `today` refreshes, and the next window is still known.
  const range = useDailyTargetsRange(today, shiftDateKey(today, 2));
  const state = useAlarmState();
  // A new targets array comes on every live update; only the windows matter.
  const digest = range?.map((t) => `${t.date}|${t.wakeTime}|${t.wakeWindowMin}`).join(',');
  const windows = useMemo(() => (digest === undefined ? undefined : parseWindows(digest)), [digest]);
  const latest = useRef<typeof windows>(undefined);
  const started = useRef(false);

  useEffect(() => {
    latest.current = windows;
  }, [windows]);

  const arm = useRef(() => {
    const byDay = latest.current;
    if (!byDay) return;
    const force = !started.current;
    started.current = true;
    keepArmed(nextAlarm(Date.now(), (day) => byDay.get(day))?.at, { force }).catch((e: unknown) =>
      console.error('keepArmed failed', e),
    );
  }).current;

  useEffect(() => {
    if (state?.enabled && windows) arm();
  }, [arm, state?.enabled, windows]);

  useEffect(
    () =>
      onAlarmDismissed((e) => {
        recordDismissal(e)
          .then(arm)
          .catch((err: unknown) => console.error('recordDismissal failed', err));
      }),
    [arm],
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') arm();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', arm);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', arm);
    };
  }, [arm]);

  useEffect(() => {
    if (!state?.enabled || state.at === undefined) return;
    const timer = setTimeout(arm, Math.max(0, state.at + AFTER_RING_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [arm, state?.enabled, state?.at]);

  return null;
}
