import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { ALARM_TEXTS } from '../../../core/platform';
import { mockAlarm, mockNativePlatform } from '../../../test/platform';
import {
  clearDismissal,
  disableAlarm,
  enableAlarm,
  keepArmed,
  loadAlarmState,
  loadDismissal,
  recordDismissal,
} from './alarm';

const NOW = new Date(2026, 10, 7, 22, 0).getTime();
const AT = new Date(2026, 10, 8, 6, 30).getTime();

beforeEach(async () => {
  await db.settings.clear();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => vi.restoreAllMocks());

describe('alarm data', () => {
  it('enable sets the native alarm at the start of the window and remembers it; disable cancels', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    expect(await enableAlarm(AT)).toEqual({ status: 'set' });
    expect(alarm.scheduled).toEqual({ at: AT, windowMin: 0 });
    expect(await loadAlarmState()).toEqual({ enabled: true, at: AT });

    await disableAlarm();
    expect(alarm.scheduled).toBeUndefined();
    expect(await loadAlarmState()).toEqual({ enabled: false });
  });

  it('a refused alarm stays off and says why', async () => {
    mockNativePlatform('android', ['alarms']);
    mockAlarm('denied');
    expect(await enableAlarm(AT)).toEqual({ status: 'denied', hint: ALARM_TEXTS.denied });
    expect(await loadAlarmState()).toEqual({ enabled: false });
  });

  it('keepArmed sets the next alarm once the last one has rung, and only when on', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await keepArmed(AT);
    expect(alarm.bridge.set).not.toHaveBeenCalled(); // off

    await enableAlarm(AT);
    await keepArmed(AT);
    expect(alarm.bridge.set).toHaveBeenCalledTimes(1); // already set for this window

    const tomorrow = AT + 24 * 3_600_000;
    vi.spyOn(Date, 'now').mockReturnValue(AT + 60_000); // it rang
    await keepArmed(tomorrow);
    expect(alarm.scheduled).toEqual({ at: tomorrow, windowMin: 0 });
    expect(await loadAlarmState()).toEqual({ enabled: true, at: tomorrow });
  });

  it('a dismissal is kept until handled', async () => {
    expect(await loadDismissal()).toBeUndefined();
    await recordDismissal({ dismissedAt: AT + 240_000, alarmAt: AT });
    expect(await loadDismissal()).toEqual({ dismissedAt: AT + 240_000, alarmAt: AT });
    await clearDismissal();
    expect(await loadDismissal()).toBeUndefined();
  });

  it('broken stored values read as defaults', async () => {
    await db.settings.put({ key: 'health.alarm', value: { enabled: 'yes' } });
    await db.settings.put({ key: 'health.alarm.dismissal', value: 42 });
    expect(await loadAlarmState()).toEqual({ enabled: false });
    expect(await loadDismissal()).toBeUndefined();
  });

  it('a failed re-arm is stored with its hint; switching off while it is set keeps it off; force re-sets', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await enableAlarm(AT);
    alarm.exactAlarm = 'denied';
    await keepArmed(AT + 86_400_000);
    expect(await loadAlarmState()).toEqual({ enabled: true, error: ALARM_TEXTS.exactDenied });

    alarm.exactAlarm = 'granted';
    await keepArmed(AT); // an error is retried
    expect(await loadAlarmState()).toEqual({ enabled: true, at: AT });
    await keepArmed(AT, { force: true });
    expect(alarm.bridge.set).toHaveBeenCalledTimes(4);

    alarm.bridge.set.mockImplementationOnce(async ({ at, windowMin }) => {
      await disableAlarm(); // the user taps «Выключен» meanwhile
      alarm.scheduled = { at, windowMin };
    });
    await keepArmed(AT, { force: true });
    expect(await loadAlarmState()).toEqual({ enabled: false });
    expect(alarm.scheduled).toBeUndefined();
  });
});
