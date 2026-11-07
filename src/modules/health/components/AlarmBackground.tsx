import { useEffect, useMemo } from 'react';
import { useDailyTargetsRange } from '../../../core/adaptation/useDailyTargets';
import { shiftDateKey, useTodayKey } from '../../../core/dates';
import { getCapabilities, onAlarmDismissed } from '../../../core/platform';
import { keepArmed, recordDismissal, useAlarmState } from '../data/alarm';
import { nextAlarm } from '../logic/alarm';

/**
 * Mounted by the shell on every page (#129): the native alarm rings once, so while it is on this keeps the next
 * wake window's alarm set (from the targets of today and tomorrow), and stores a switch-off for «Я встал».
 * The alarm is set again whenever the app runs: a day without opening the app leaves the last alarm as it was.
 */
export function AlarmBackground() {
  const today = useTodayKey();
  const range = useDailyTargetsRange(today, shiftDateKey(today, 1));
  const state = useAlarmState();
  const available = getCapabilities().alarms;
  const windows = useMemo(() => range?.map((t) => `${t.date}|${t.wakeTime}|${t.wakeWindowMin}`).join(','), [range]);

  useEffect(() => {
    if (!available) return;
    return onAlarmDismissed((e) => {
      recordDismissal(e).catch((err: unknown) => console.error('recordDismissal failed', err));
    });
  }, [available]);

  useEffect(() => {
    if (!available || !state?.enabled || !windows) return;
    const byDay = new Map(
      windows.split(',').map((w) => {
        const [date = '', wakeTime = '', min = '0'] = w.split('|');
        return [date, { wakeTime, wakeWindowMin: Number(min) }];
      }),
    );
    keepArmed(nextAlarm(Date.now(), (day) => byDay.get(day))?.at).catch((e: unknown) =>
      console.error('keepArmed failed', e),
    );
  }, [available, state?.enabled, state?.at, windows]);

  return null;
}
