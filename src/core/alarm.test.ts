import { cruise, type ICruiseResult } from 'dependency-cruiser';
import extractDepcruiseConfig from 'dependency-cruiser/config-utl/extract-depcruise-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockAlarm, mockNativePlatform, resetPlatform } from '../test/platform';
import {
  ALARM_TEXTS,
  cancelAlarm,
  getCapabilities,
  onAlarmDismissed,
  setAlarm,
  type AlarmDismissedEvent,
} from './platform';

const NOW = new Date(2026, 10, 7, 22, 0).getTime();
const WAKE = new Date(2026, 10, 8, 7, 0).getTime();

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lets the wrapper's pending promises (listener attach, draining dismissals) settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('alarm — setAlarm / cancelAlarm', () => {
  it('Given src/core/platform.ts When модуль вызывает setAlarm({ at, windowMin }) и cancelAlarm() Then на нативе будильник звонит при закрытом приложении через плагин; на вебе возвращается unsupported; флаг alarms отражает это', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm('granted');
    expect(getCapabilities().alarms).toBe(true);

    expect(await setAlarm({ at: WAKE, windowMin: 30 })).toEqual({ status: 'set' });
    // The OS (AlarmManager through the plugin) holds the alarm: it rings with the app closed.
    expect(alarm.scheduled).toEqual({ at: WAKE, windowMin: 30 });
    await cancelAlarm();
    expect(alarm.scheduled).toBeUndefined();

    resetPlatform();
    expect(getCapabilities().alarms).toBe(false);
    expect(await setAlarm({ at: WAKE, windowMin: 30 })).toEqual({ status: 'unsupported', hint: ALARM_TEXTS.web });
    await expect(cancelAlarm()).resolves.toBeUndefined();
  });

  it('a native shell without the alarm plugin (iOS today) is unsupported with its own hint', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('ios', ['notifications']);
    const alarm = mockAlarm();
    expect(getCapabilities().alarms).toBe(false);
    expect(await setAlarm({ at: WAKE, windowMin: 0 })).toEqual({
      status: 'unsupported',
      hint: ALARM_TEXTS.nativeUnsupported,
    });
    await cancelAlarm();
    expect(alarm.bridge.set).not.toHaveBeenCalled();
    expect(alarm.bridge.cancel).not.toHaveBeenCalled();
  });

  it('a new alarm replaces the previous one', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await setAlarm({ at: WAKE, windowMin: 30 });
    await setAlarm({ at: WAKE + 3_600_000, windowMin: 15 });
    expect(alarm.scheduled).toEqual({ at: WAKE + 3_600_000, windowMin: 15 });
  });

  it('asks for notifications once when undecided; a refusal is denied with a hint and nothing is set', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('android', ['alarms']);
    const asked = mockAlarm('prompt', 'granted');
    expect(await setAlarm({ at: WAKE, windowMin: 30 })).toEqual({ status: 'set' });
    expect(asked.bridge.requestPermissions).toHaveBeenCalledTimes(1);

    const refused = mockAlarm('prompt', 'denied');
    expect(await setAlarm({ at: WAKE, windowMin: 30 })).toEqual({ status: 'denied', hint: ALARM_TEXTS.denied });
    expect(refused.scheduled).toBeUndefined();

    const off = mockAlarm('denied');
    expect(await setAlarm({ at: WAKE, windowMin: 30 })).toEqual({ status: 'denied', hint: ALARM_TEXTS.denied });
    expect(off.bridge.requestPermissions).not.toHaveBeenCalled();
  });

  it('Android with «Alarms & reminders» switched off is denied with a hint about that setting', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    alarm.exactAlarm = 'denied';
    expect(await setAlarm({ at: WAKE, windowMin: 30 })).toEqual({ status: 'denied', hint: ALARM_TEXTS.exactDenied });
  });

  it('a plugin failure is failed with a hint and never rejects; a failed cancel is logged', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    alarm.setError = new Error('boom');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await setAlarm({ at: WAKE, windowMin: 30 })).toEqual({ status: 'failed', hint: ALARM_TEXTS.failed });
    alarm.bridge.cancel.mockRejectedValueOnce(new Error('gone'));
    await expect(cancelAlarm()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('rejects a time that has passed and a window that is not 0…120 whole minutes, without calling the plugin', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    expect(await setAlarm({ at: NOW, windowMin: 30 })).toEqual({ status: 'failed', hint: ALARM_TEXTS.past });
    expect(await setAlarm({ at: Number.NaN, windowMin: 30 })).toEqual({ status: 'failed', hint: ALARM_TEXTS.past });
    for (const windowMin of [-1, 121, 12.5, Number.NaN])
      expect(await setAlarm({ at: WAKE, windowMin })).toEqual({ status: 'failed', hint: ALARM_TEXTS.window });
    expect(alarm.bridge.set).not.toHaveBeenCalled();
  });
});

describe('alarm — alarm:dismissed', () => {
  it('Given будильник звонит When пользователь выключает его Then событие alarm:dismissed с временем доступно подписчикам', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await setAlarm({ at: WAKE, windowMin: 30 });
    const first: AlarmDismissedEvent[] = [];
    const second: AlarmDismissedEvent[] = [];
    const offFirst = onAlarmDismissed((e) => first.push(e));
    onAlarmDismissed((e) => second.push(e));
    await settle();

    alarm.dismiss(WAKE + 90_000);
    await settle();

    const event: AlarmDismissedEvent = { type: 'alarm:dismissed', dismissedAt: WAKE + 90_000, alarmAt: WAKE };
    expect(first).toEqual([event]);
    expect(second).toEqual([event]);

    offFirst();
    alarm.dismiss(WAKE + 120_000);
    await settle();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
  });

  it('a dismissal while the app was closed reaches the first subscriber once', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    alarm.scheduled = { at: WAKE, windowMin: 30 };
    alarm.dismiss(WAKE + 60_000); // nobody listens: the native side keeps it

    const seen: AlarmDismissedEvent[] = [];
    const off = onAlarmDismissed((e) => seen.push(e));
    await settle();
    expect(seen).toEqual([{ type: 'alarm:dismissed', dismissedAt: WAKE + 60_000, alarmAt: WAKE }]);

    off();
    await settle();
    expect(alarm.listening).toBe(false);
    onAlarmDismissed((e) => seen.push(e));
    await settle();
    expect(seen).toHaveLength(1);
  });

  it('a listener that throws does not stop the others; on the web subscribing does nothing', async () => {
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: number[] = [];
    onAlarmDismissed(() => {
      throw new Error('bad listener');
    });
    onAlarmDismissed((e) => seen.push(e.dismissedAt));
    await settle();
    alarm.dismiss(WAKE);
    await settle();
    expect(seen).toEqual([WAKE]);
    expect(error).toHaveBeenCalled();

    resetPlatform();
    const web = mockAlarm();
    mockNativePlatform('android', []);
    const off = onAlarmDismissed(() => {});
    await settle();
    expect(web.bridge.addListener).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });
});

describe('alarm — tests and boundaries', () => {
  it('Given тесты When прогоняются Then обёртка мокается целиком; ни один модуль не импортирует @capacitor-*', async () => {
    // The whole native side is one fake: every method of the bridge is a mock and nothing reaches Capacitor.
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockNativePlatform('android', ['alarms']);
    const alarm = mockAlarm();
    await setAlarm({ at: WAKE, windowMin: 10 });
    await cancelAlarm();
    onAlarmDismissed(() => {});
    await settle();
    for (const method of Object.values(alarm.bridge)) expect(vi.isMockFunction(method)).toBe(true);
    expect(alarm.bridge.set).toHaveBeenCalledTimes(1);

    // No module reaches the native side past platform.ts (the project's own rule, as `npm run deps` runs it).
    const config = await extractDepcruiseConfig('./.dependency-cruiser.cjs');
    const { output } = await cruise(['src/modules'], {
      ...config.options,
      validate: true,
      ruleSet: { forbidden: config.forbidden },
    });
    const native = (output as ICruiseResult).summary.violations.filter(
      (v) => v.rule.name === 'native-only-through-platform',
    );
    expect(native).toEqual([]);
    expect((output as ICruiseResult).summary.totalCruised).toBeGreaterThan(50);
  }, 30_000);
});
