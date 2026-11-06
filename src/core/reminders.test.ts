import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockLocalNotifications, mockNativePlatform } from '../test/platform';
import { cancelReminder, reminderNotificationId, scheduleReminder } from './platform';

const NOW = new Date(2026, 10, 6, 21, 0);
const BEDTIME = new Date(2026, 10, 6, 23, 0);
const reminder = { id: 'habit-1', title: 'Пора готовиться ко сну', body: 'Отбой в 23:30', at: BEDTIME };

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

afterEach(async () => {
  await cancelReminder(reminder.id);
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
        id: reminderNotificationId('habit-1'),
        title: 'Пора готовиться ко сну',
        body: 'Отбой в 23:30',
        schedule: { at: BEDTIME, allowWhileIdle: true },
        isExactNotification: false,
      },
    ]);
  });

  it('asks for the permission once when it was not decided yet', async () => {
    mockNativePlatform('ios', ['notifications']);
    const plugin = mockLocalNotifications('prompt', 'granted');
    expect(await scheduleReminder(reminder)).toEqual({ status: 'scheduled' });
    expect(plugin.scheduled).toHaveLength(1);
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
    const ids = ['habit-1', 'habit-2', 'task-1', 'bedtime'].map(reminderNotificationId);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(Number.isInteger(id) && id > 0 && id <= 0x7fffffff).toBe(true);
    expect(reminderNotificationId('habit-1')).toBe(ids[0]);
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
    vi.advanceTimersByTime(BEDTIME.getTime() - NOW.getTime() - 1);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([{ title: 'Пора готовиться ко сну', body: 'Отбой в 23:30', tag: 'habit-1' }]);
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
    vi.advanceTimersByTime(30 * 24 * 3600_000 - 1);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toHaveLength(1);
  });

  it('a second reminder with the same id replaces the first', async () => {
    const { shown } = stubWebNotifications('granted');
    await scheduleReminder(reminder);
    await scheduleReminder({ ...reminder, title: 'Новое время', at: new Date(2026, 10, 6, 22, 0) });
    vi.advanceTimersByTime(3 * 3600_000);
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

  it('returns denied on the web when the browser permission is blocked', async () => {
    const { shown, FakeNotification } = stubWebNotifications('denied');
    expect(await scheduleReminder(reminder)).toEqual({
      status: 'denied',
      hint: 'Уведомления заблокированы. Разрешите их для этого сайта в настройках браузера.',
    });
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3 * 3600_000);
    expect(shown).toEqual([]);
  });
});

describe('cancelReminder', () => {
  it('Given запись с напоминанием удалена When модуль отменяет его Then уведомление отменено', async () => {
    mockNativePlatform('android', ['notifications']);
    const plugin = mockLocalNotifications('granted');
    await scheduleReminder(reminder);
    await cancelReminder(reminder.id);
    expect(plugin.cancelled).toEqual([reminderNotificationId('habit-1')]);
    expect(plugin.scheduled).toEqual([]);
  });

  it('cancels a pending web reminder, so it never shows', async () => {
    const { shown } = stubWebNotifications('granted');
    await scheduleReminder(reminder);
    await cancelReminder(reminder.id);
    vi.advanceTimersByTime(3 * 3600_000);
    expect(shown).toEqual([]);
  });

  it('cancelling a reminder that does not exist is harmless', async () => {
    await expect(cancelReminder('nothing')).resolves.toBeUndefined();
  });
});
