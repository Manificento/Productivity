import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockHealthStore, mockNativePlatform } from '../test/platform';
import { getCapabilities, openHealthSettings, readSleep, readWorkouts, requestHealthAccess } from './platform';

const iso = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const ms = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

const night = (id: string, sourceId: string, d: number) => ({
  dataType: 'sleep' as const,
  value: 0,
  unit: 'minute' as const,
  startDate: iso(d - 1, 23),
  endDate: iso(d, 7),
  platformId: id,
  sourceId,
  sleepState: 'asleep' as const,
});
const run = (id: string, d: number, sourceId = 'com.strava') => ({
  workoutType: 'running' as const,
  duration: 1800,
  startDate: iso(d, 7),
  endDate: iso(d, 7, 30),
  platformId: id,
  sourceId,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('health store import', () => {
  it('Given src/core/platform.ts When модуль вызывает readSleep(from, to) и readWorkouts(from, to) Then на нативе данные приходят из Health Connect / HealthKit в типах ядра; на вебе — unsupported; флаг healthImport отражает это', async () => {
    // Web: no health store, the flag is off.
    expect(getCapabilities().healthImport).toBe(false);
    expect(await readSleep('2026-11-05', '2026-11-06')).toEqual({
      status: 'unsupported',
      hint: 'Импорт из Health Connect и Apple Health работает только в приложении для телефона.',
    });
    expect((await readWorkouts('2026-11-05', '2026-11-06')).status).toBe('unsupported');

    // Android with the plugin: the flag is on, records come in core types.
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.sleep = [night('n-5', 'com.fitbit', 5), night('n-6', 'com.fitbit', 6), night('n-8', 'com.fitbit', 8)];
    store.workouts = [run('w-4', 4), run('w-6', 6)];
    expect(getCapabilities().healthImport).toBe(true);

    expect(await readSleep('2026-11-05', '2026-11-06')).toEqual({
      status: 'ok',
      items: [
        {
          externalId: 'n-5',
          sourceId: 'com.fitbit',
          bedtime: ms(4, 23),
          wakeTime: ms(5, 7),
          asleepMin: 480,
          main: true,
        },
        {
          externalId: 'n-6',
          sourceId: 'com.fitbit',
          bedtime: ms(5, 23),
          wakeTime: ms(6, 7),
          asleepMin: 480,
          main: true,
        },
      ],
    });
    expect(await readWorkouts('2026-11-05', '2026-11-06')).toEqual({
      status: 'ok',
      items: [
        {
          externalId: 'w-6',
          sourceId: 'com.strava',
          date: '2026-11-06',
          startedAt: ms(6, 7),
          type: 'Бег',
          durationMin: 30,
        },
      ],
    });
  });

  it('on native without the health plugin the flag is off and reading is unsupported', async () => {
    mockNativePlatform('ios');
    const store = mockHealthStore();
    expect(getCapabilities().healthImport).toBe(false);
    expect((await readSleep('2026-11-05', '2026-11-06')).status).toBe('unsupported');
    expect(store.bridge.readSamples).not.toHaveBeenCalled();
  });

  it.each([
    [
      'Health Connect needs an update.',
      'Обновите «Health Connect» в Google Play, чтобы LifeOS мог читать сон и тренировки.',
    ],
    [
      'Health Connect is unavailable on this device.',
      'Health Connect недоступен на этом телефоне: нужен Android 9 или новее.',
    ],
    [undefined, 'Health Connect недоступен. Установите или обновите его в Google Play.'],
  ])('explains an unavailable Health Connect (%s)', async (reason, hint) => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.available = false;
    store.reason = reason;
    expect(await readWorkouts('2026-11-05', '2026-11-06')).toEqual({ status: 'unsupported', hint });
  });

  it('Given разрешение не дано When вызывается чтение Then статус denied, модуль показывает подсказку', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore([]);
    expect(await readSleep('2026-11-05', '2026-11-06')).toEqual({
      status: 'denied',
      hint: 'Нет доступа к сну и тренировкам. Разрешите их LifeOS в настройках Health Connect.',
    });
    // Reading never opens the access sheet by itself.
    expect(store.bridge.requestAuthorization).not.toHaveBeenCalled();
    expect(store.bridge.readSamples).not.toHaveBeenCalled();
    expect(await openHealthSettings()).toBe(true);
    expect(store.bridge.openHealthConnectSettings).toHaveBeenCalledOnce();
  });

  it('requestHealthAccess asks for sleep and workouts in one sheet; concurrent calls share it', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore([]);
    store.workouts = [run('w-6', 6)];
    const [a, b] = await Promise.all([requestHealthAccess(), requestHealthAccess()]);
    expect([a, b]).toEqual([{ status: 'granted' }, { status: 'granted' }]);
    expect(store.bridge.requestAuthorization).toHaveBeenCalledOnce();
    expect(store.bridge.requestAuthorization).toHaveBeenCalledWith({ read: ['sleep', 'workouts'] });

    const [sleep, workouts] = await Promise.all([
      readSleep('2026-11-06', '2026-11-06'),
      readWorkouts('2026-11-06', '2026-11-06'),
    ]);
    expect(sleep.status).toBe('ok');
    expect(workouts.status === 'ok' && workouts.items.map((w) => w.externalId)).toEqual(['w-6']);
  });

  it('a sheet answer that differs per kind is denied for the access, and reads tell the kinds apart', async () => {
    mockNativePlatform('android', ['healthImport']);
    mockHealthStore([], { sleep: 'allow', workouts: 'deny' });
    expect((await requestHealthAccess()).status).toBe('denied');
    expect((await readSleep('2026-11-06', '2026-11-06')).status).toBe('ok');
    expect((await readWorkouts('2026-11-06', '2026-11-06')).status).toBe('denied');
  });

  it('iOS hides a refusal: after the sheet reading is «ok» but empty, with a hint where to check access', async () => {
    mockNativePlatform('ios', ['healthImport']);
    const store = mockHealthStore([], { sleep: 'deny', workouts: 'deny' });
    store.hidesDenial = true;
    store.workouts = [run('w-6', 6)];
    // Before the sheet: denied, the module offers «Подключить».
    expect(await readWorkouts('2026-11-06', '2026-11-06')).toEqual({
      status: 'denied',
      hint: 'Разрешите LifeOS читать сон и тренировки из приложения «Здоровье».',
    });
    expect(await requestHealthAccess()).toEqual({ status: 'granted' });
    expect(await readWorkouts('2026-11-06', '2026-11-06')).toEqual({
      status: 'ok',
      items: [],
      hint: 'Данных нет. Если вы не разрешили доступ: Настройки → Здоровье → Доступ к данным → LifeOS.',
    });
    expect(await openHealthSettings()).toBe(false);
  });

  it('iOS: a sheet that could not be completed is denied, not failed', async () => {
    mockNativePlatform('ios', ['healthImport']);
    const store = mockHealthStore([]);
    store.bridge.requestAuthorization.mockRejectedValueOnce(new Error('Authorization request was not granted.'));
    expect((await requestHealthAccess()).status).toBe('denied');
  });

  it('Given тесты When прогоняются Then обёртка мокается; дубли по внешнему sourceId различимы', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    // The same night from the watch app and from the phone; the same workout read twice keeps its id.
    store.sleep = [night('watch-6', 'com.watch', 6), night('phone-6', 'com.phone', 6)];
    store.workouts = [run('w-6', 6)];
    const sleep = await readSleep('2026-11-06', '2026-11-06');
    expect(sleep.status === 'ok' && sleep.items.map((n) => [n.sourceId, n.externalId, n.main])).toEqual([
      ['com.phone', 'phone-6', true],
      ['com.watch', 'watch-6', true],
    ]);
    const first = await readWorkouts('2026-11-06', '2026-11-06');
    expect(await readWorkouts('2026-11-06', '2026-11-06')).toEqual(first);
    expect(first.status === 'ok' && first.items[0].externalId).toBe('w-6');
  });

  it('reads sleep from noon to noon, so a night is not cut at midnight after the last day', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    const seg = (id: string, d1: number, h1: number, m1: number, d2: number, h2: number, m2: number) => ({
      ...night(id, 'com.apple.health', 6),
      startDate: iso(d1, h1, m1),
      endDate: iso(d2, h2, m2),
    });
    // The night after `to` (6 Nov) has a 20-minute break around midnight: it must not become a «night» ending on the 6th.
    store.sleep = [night('n-6', 'com.apple.health', 6), seg('a', 6, 23, 0, 6, 23, 50), seg('b', 7, 0, 10, 7, 7, 0)];
    const result = await readSleep('2026-11-06', '2026-11-06');
    expect(result.status === 'ok' && result.items.map((n) => n.externalId)).toEqual(['n-6']);
  });

  it('reads a long range a week at a time and counts a night crossing a chunk border once', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.sleep = Array.from({ length: 20 }, (_, i) => night(`n-${i + 1}`, 'com.fitbit', i + 1));
    const result = await readSleep('2026-11-01', '2026-11-20');
    expect(result.status === 'ok' && result.items.map((n) => n.externalId)).toEqual(
      Array.from({ length: 20 }, (_, i) => `n-${i + 1}`),
    );
    expect(store.bridge.readSamples).toHaveBeenCalledTimes(3);
  });

  it('follows the workout pages, drops repeats at page borders and stops with failed instead of cutting data', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.pageSize = 2;
    store.workouts = [1, 2, 2, 3, 4, 5].map((d, i) => run(i === 2 ? 'w-2' : `w-${d}`, d));
    const result = await readWorkouts('2026-11-01', '2026-11-05');
    expect(result.status === 'ok' && result.items.map((w) => w.externalId)).toEqual([
      'w-1',
      'w-2',
      'w-3',
      'w-4',
      'w-5',
    ]);
    expect(store.bridge.queryWorkouts).toHaveBeenCalledTimes(3);

    store.pageSize = 1;
    store.workouts = Array.from({ length: 25 }, (_, i) => run(`m-${i}`, 3));
    expect(await readWorkouts('2026-11-01', '2026-11-05')).toEqual({
      status: 'failed',
      hint: 'Слишком много записей за этот период. Выберите период короче.',
    });
  });

  it('an empty or reversed range reads nothing without asking the store', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    expect(await readWorkouts('2026-11-06', '2026-11-05')).toEqual({ status: 'ok', items: [] });
    expect(store.bridge.queryWorkouts).not.toHaveBeenCalled();
  });

  it('reports a store error as a status, not as an exception', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store.bridge.readSamples.mockRejectedValueOnce(new Error('Health Connect crashed'));
    expect(await readSleep('2026-11-05', '2026-11-06')).toEqual({
      status: 'failed',
      hint: 'Не удалось прочитать данные о здоровье. Попробуйте ещё раз.',
    });
  });
});
