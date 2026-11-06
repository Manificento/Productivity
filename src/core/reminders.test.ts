import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockLocalNotifications, mockNativePlatform } from '../test/platform';
import { cancelReminder, reminderNotificationId, scheduleReminder } from './platform';

const NOW = new Date(2026, 10, 6, 21, 0);
const BEDTIME = new Date(2026, 10, 6, 23, 0);
const reminder = { id: 'habits:1', title: 'Пора готовиться ко сну', body: 'Отбой в 23:30', at: BEDTIME };

/** A minimal browser Notification API that records shown notifications. */
function stubWebNotifications(permission: NotificationPermission, answer: NotificationPermission = permission) {
  const shown: { title: string; body?: string; tag?: string }[] = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => {
      if (FakeNotification.permission === 'default') FakeNotification.permission = answer;
      return FakeNotification.permission;
    });
    constructor(title: string, options: NotificationOptions = {}) {
      shown.push({ title, body: options.body, tag: options.tag });
    }
  }
  vi.stubGlobal('Notification', FakeNotification);
  return { shown, FakeNotification };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scheduleReminder: натив', () => {
  it('Given натив When модуль вызывает scheduleReminder() Then локальное уведомление в заданное время, в том числе при закрытом приложении', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('granted');

    expect(await scheduleReminder(reminder)).toEqual({ status: 'scheduled' });
    // Scheduled with the OS (not a JS timer), so it fires while the app is closed; allowed in Doze.
    expect(plugin.scheduled).toEqual([
      {
        id: reminderNotificationId('habits:1'),
        title: 'Пора готовиться ко сну',
        body: 'Отбой в 23:30',
        schedule: { at: BEDTIME, allowWhileIdle: true },
        isExactNotification: true,
      },
    ]);
  });

  it('without «Alarms & reminders» on Android schedules an inexact reminder and says it may come late', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('granted');
    plugin.exactAlarm = 'denied';
    expect(await scheduleReminder(reminder)).toEqual({
      status: 'scheduled',
      limitation:
        'Напоминание может прийти с опозданием до часа. Включите «Будильники и напоминания» для LifeOS в настройках.',
    });
    // Inexact outright: the plugin never opens the system settings screen by itself.
    expect(plugin.scheduled[0]).toMatchObject({ isExactNotification: false });
  });

  it('iOS has no exact-alarm setting and is always exact', async () => {
    mockNativePlatform('ios', ['notifications']);
    const plugin = mockLocalNotifications('granted');
    expect(await scheduleReminder(reminder)).toEqual({ status: 'scheduled' });
    expect(plugin.bridge.checkExactNotificationSetting).not.toHaveBeenCalled();
    expect(plugin.scheduled[0]).toMatchObject({ isExactNotification: true });
  });

  it.each(['prompt', 'prompt-with-rationale'] as const)(
    'asks for the permission once when it is «%s»',
    async (permission) => {
      mockNativePlatform('ios', ['notifications']);
      const plugin = mockLocalNotifications(permission, 'granted');
      expect(await scheduleReminder(reminder)).toEqual({ status: 'scheduled' });
      expect(plugin.bridge.requestPermissions).toHaveBeenCalledOnce();
      expect(plugin.scheduled).toHaveLength(1);
    },
  );

  it('a time in the past is passed on as is: the system shows it at once', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('granted');
    const past = new Date(2026, 10, 6, 20, 0);
    expect((await scheduleReminder({ ...reminder, at: past })).status).toBe('scheduled');
    expect(plugin.scheduled[0].schedule?.at).toEqual(past);
  });

  it('reports a refused schedule as a status, not as an error', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('granted');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    plugin.scheduleError = Object.assign(new Error('Notifications are disabled'), { code: 'OS-PLUG-LNOT-0005' });
    expect((await scheduleReminder(reminder)).status).toBe('denied');
    plugin.scheduleError = new Error('bridge is down');
    expect(await scheduleReminder(reminder)).toEqual({
      status: 'failed',
      hint: 'Не удалось запланировать напоминание. Попробуйте ещё раз.',
    });
  });

  it('rejects an invalid time before touching the platform', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('granted');
    await expect(scheduleReminder({ ...reminder, at: new Date(Number.NaN) })).rejects.toThrow(RangeError);
    expect(plugin.bridge.checkPermissions).not.toHaveBeenCalled();
  });

  it('a second reminder with the same id replaces the first', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('granted');
    await scheduleReminder(reminder);
    await scheduleReminder({ ...reminder, at: new Date(2026, 10, 6, 22, 30) });
    expect(plugin.scheduled.map((n) => n.schedule?.at)).toEqual([new Date(2026, 10, 6, 22, 30)]);
  });

  it('without the notifications plugin says it is unavailable instead of failing', async () => {
    mockNativePlatform('android');
    const plugin = mockLocalNotifications('granted');
    const result = await scheduleReminder(reminder);
    expect(result.status).toBe('unsupported');
    expect(plugin.scheduled).toEqual([]);
  });

  it('maps different record ids to different positive 32-bit notification ids, the same id to the same one', () => {
    const ids = ['habits:1', 'habits:2', 'tasks:1', 'sleep:bedtime'].map(reminderNotificationId);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(Number.isInteger(id) && id > 0 && id <= 0x7fffffff).toBe(true);
    expect(reminderNotificationId('habits:1')).toBe(ids[0]);
  });
});

describe('scheduleReminder: веб', () => {
  it('Given веб When вызывается scheduleReminder() Then Notification API при открытой вкладке, иначе объяснение ограничений', async () => {
    const { shown } = stubWebNotifications('granted');
    const result = await scheduleReminder(reminder);
    expect(result).toEqual({
      status: 'scheduled',
      limitation: 'В браузере напоминание сработает, только пока вкладка открыта.',
    });
    await vi.advanceTimersByTimeAsync(BEDTIME.getTime() - NOW.getTime() - 1);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(shown).toEqual([{ title: 'Пора готовиться ко сну', body: 'Отбой в 23:30', tag: 'habits:1' }]);
  });

  it('shows the notification through the service worker where the constructor is forbidden (Android Chrome)', async () => {
    const { FakeNotification } = stubWebNotifications('granted');
    const constructor = vi.fn(() => {
      throw new TypeError('Illegal constructor');
    });
    vi.stubGlobal('Notification', Object.assign(constructor, { permission: FakeNotification.permission }));
    const showNotification = vi.fn(async () => {});
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: async () => ({ showNotification }) },
    });

    await scheduleReminder(reminder);
    await vi.advanceTimersByTimeAsync(BEDTIME.getTime() - NOW.getTime());
    expect(showNotification).toHaveBeenCalledWith('Пора готовиться ко сну', { body: 'Отбой в 23:30', tag: 'habits:1' });
    expect(constructor).not.toHaveBeenCalled();
  });

  it('falls back to the constructor when the service worker cannot show it yet', async () => {
    const { shown } = stubWebNotifications('granted');
    const showNotification = vi.fn(async () => {
      throw new TypeError('No active registration');
    });
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: async () => ({ showNotification }) },
    });
    await scheduleReminder(reminder);
    await vi.advanceTimersByTimeAsync(BEDTIME.getTime() - NOW.getTime());
    expect(shown).toHaveLength(1);
  });

  it('explains when the browser cannot show notifications at all', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(await scheduleReminder(reminder)).toEqual({
      status: 'unsupported',
      hint: 'Этот браузер не показывает уведомления. Напоминания работают в приложении для Android.',
    });
  });

  it('asks the browser for the permission when it was not decided yet', async () => {
    const { FakeNotification } = stubWebNotifications('default', 'granted');
    expect((await scheduleReminder(reminder)).status).toBe('scheduled');
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
  });

  it('fires reminders further away than the browser timer limit (~24.8 days)', async () => {
    const { shown } = stubWebNotifications('granted');
    const at = new Date(NOW.getTime() + 30 * 24 * 3600_000);
    await scheduleReminder({ ...reminder, at });
    await vi.advanceTimersByTimeAsync(30 * 24 * 3600_000 - 1);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(shown).toHaveLength(1);
  });

  it('a second reminder with the same id replaces the first', async () => {
    const { shown } = stubWebNotifications('granted');
    await scheduleReminder(reminder);
    await scheduleReminder({ ...reminder, title: 'Новое время', at: new Date(2026, 10, 6, 22, 0) });
    await vi.advanceTimersByTimeAsync(3 * 3600_000);
    expect(shown.map((n) => n.title)).toEqual(['Новое время']);
  });
});

describe('scheduleReminder: разрешение не дано', () => {
  it('Given разрешение не дано When планируется напоминание Then возвращается статус denied, модуль показывает подсказку', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('prompt', 'denied');
    expect(await scheduleReminder(reminder)).toEqual({
      status: 'denied',
      hint: 'Уведомления выключены. Разрешите их для LifeOS в настройках телефона.',
    });
    expect(plugin.scheduled).toEqual([]);
  });

  it('does not ask again when the permission was already refused', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('denied');
    expect((await scheduleReminder(reminder)).status).toBe('denied');
    expect(plugin.bridge.requestPermissions).not.toHaveBeenCalled();
  });

  it('returns denied on the web when the browser permission is blocked', async () => {
    const { shown, FakeNotification } = stubWebNotifications('denied');
    expect(await scheduleReminder(reminder)).toEqual({
      status: 'denied',
      hint: 'Уведомления заблокированы. Разрешите их для этого сайта в настройках браузера.',
    });
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3 * 3600_000);
    expect(shown).toEqual([]);
  });
});

describe('cancelReminder', () => {
  it('Given запись с напоминанием удалена When модуль отменяет его Then уведомление отменено', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('granted');
    await scheduleReminder(reminder);
    await cancelReminder(reminder.id);
    expect(plugin.cancelled).toEqual([reminderNotificationId('habits:1')]);
    expect(plugin.scheduled).toEqual([]);
  });

  it('cancels a pending web reminder, so it never shows', async () => {
    const { shown } = stubWebNotifications('granted');
    await scheduleReminder(reminder);
    await cancelReminder(reminder.id);
    await vi.advanceTimersByTimeAsync(3 * 3600_000);
    expect(shown).toEqual([]);
  });

  it('a cancel is not overtaken by a schedule still waiting for the permission answer', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('prompt', 'granted');
    const scheduling = scheduleReminder(reminder);
    await cancelReminder(reminder.id);
    await scheduling;
    expect(plugin.scheduled).toEqual([]);
  });

  it('cancels a web reminder in the middle of a long (chained) wait', async () => {
    const { shown } = stubWebNotifications('granted');
    await scheduleReminder({ ...reminder, at: new Date(NOW.getTime() + 30 * 24 * 3600_000) });
    await vi.advanceTimersByTimeAsync(26 * 24 * 3600_000);
    await cancelReminder(reminder.id);
    await vi.advanceTimersByTimeAsync(5 * 24 * 3600_000);
    expect(shown).toEqual([]);
  });

  it('on native without the plugin cancelling calls nothing', async () => {
    mockNativePlatform('android');
    const plugin = mockLocalNotifications('granted');
    await cancelReminder(reminder.id);
    expect(plugin.bridge.cancel).not.toHaveBeenCalled();
  });

  it('cancelling a reminder that does not exist is harmless', async () => {
    await expect(cancelReminder('nothing')).resolves.toBeUndefined();
  });
});
