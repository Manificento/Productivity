import { describe, expect, it, vi } from 'vitest';
import { mockHealthStore, mockNativePlatform } from '../test/platform';
import { getCapabilities, readSleep, readWorkouts } from './platform';

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
        { externalId: 'n-5', sourceId: 'com.fitbit', bedtime: ms(4, 23), wakeTime: ms(5, 7), asleepMin: 480 },
        { externalId: 'n-6', sourceId: 'com.fitbit', bedtime: ms(5, 23), wakeTime: ms(6, 7), asleepMin: 480 },
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

  it('explains that Health Connect must be installed when the store is unavailable', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.available = false;
    expect(await readWorkouts('2026-11-05', '2026-11-06')).toEqual({
      status: 'unsupported',
      hint: 'Установите «Health Connect» из Google Play, чтобы LifeOS мог читать сон и тренировки.',
    });
  });

  it('Given разрешение не дано When вызывается чтение Then статус denied, модуль показывает подсказку', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore([], 'deny');
    expect(await readSleep('2026-11-05', '2026-11-06')).toEqual({
      status: 'denied',
      hint: 'Нет доступа к данным. Разрешите LifeOS читать сон и тренировки в настройках Health Connect.',
    });
    expect(store.bridge.requestAuthorization).toHaveBeenCalledWith({ read: ['sleep'] });
    expect(store.bridge.readSamples).not.toHaveBeenCalled();

    mockNativePlatform('ios', ['healthImport']);
    expect((await readWorkouts('2026-11-05', '2026-11-06')).status).toBe('denied');
  });

  it('asks for access once and reads when the user allows it', async () => {
    mockNativePlatform('ios', ['healthImport']);
    const store = mockHealthStore([], 'allow');
    store.workouts = [run('w-6', 6)];
    expect((await readWorkouts('2026-11-06', '2026-11-06')).status).toBe('ok');
    expect(store.bridge.requestAuthorization).toHaveBeenCalledOnce();
    expect((await readWorkouts('2026-11-06', '2026-11-06')).status).toBe('ok');
    expect(store.bridge.requestAuthorization).toHaveBeenCalledOnce();
  });

  it('Given тесты When прогоняются Then обёртка мокается; дубли по внешнему sourceId различимы', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    // The same night from the watch app and from the phone; the same workout read twice keeps its id.
    store.sleep = [night('watch-6', 'com.watch', 6), night('phone-6', 'com.phone', 6)];
    store.workouts = [run('w-6', 6)];
    const sleep = await readSleep('2026-11-06', '2026-11-06');
    expect(sleep.status === 'ok' && sleep.items.map((n) => [n.sourceId, n.externalId])).toEqual([
      ['com.phone', 'phone-6'],
      ['com.watch', 'watch-6'],
    ]);
    const first = await readWorkouts('2026-11-06', '2026-11-06');
    const again = await readWorkouts('2026-11-06', '2026-11-06');
    expect(first).toEqual(again);
    expect(first.status === 'ok' && first.items[0].externalId).toBe('w-6');
  });

  it('follows the store pages for workouts', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.pageSize = 2;
    store.workouts = [1, 2, 3, 4, 5].map((d) => run(`w-${d}`, d));
    const result = await readWorkouts('2026-11-01', '2026-11-05');
    expect(result.status === 'ok' && result.items.map((w) => w.externalId)).toEqual([
      'w-1',
      'w-2',
      'w-3',
      'w-4',
      'w-5',
    ]);
    expect(store.bridge.queryWorkouts).toHaveBeenCalledTimes(3);
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
