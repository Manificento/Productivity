import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { mockNativePlatform, mockNightSensors } from '../test/platform';
import {
  clearNightSamples,
  readNightSamples,
  startNightSensing,
  stopNightSensing,
  type SleepSensorsBridge,
} from './platform';
import type { NightSample } from './types';

const minute = (i: number, movement: number, noiseDb = -60): NightSample => ({
  minuteStart: new Date(2026, 10, 6, 23, i).getTime(),
  movement,
  noiseDb,
  noisePeakDb: noiseDb + 10,
});

describe('night sensing', () => {
  it('Given src/core/platform.ts When модуль вызывает startNightSensing() и stopNightSensing() Then на нативе фоновая служба пишет агрегаты по минутам в буфер, который модуль читает утром; на вебе — unsupported', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');

    expect(await startNightSensing()).toEqual({ status: 'started' });
    expect(sensors.running).toBe(true);
    // The native service writes one aggregate per minute while the app may be closed.
    sensors.record(minute(0, 0.02), minute(1, 0.4, -45));
    await stopNightSensing();
    expect(sensors.running).toBe(false);

    // In the morning the module reads the buffer, saves what it needs and clears it.
    expect(await readNightSamples()).toEqual([minute(0, 0.02), minute(1, 0.4, -45)]);
    await clearNightSamples();
    expect(await readNightSamples()).toEqual([]);
  });

  it('on the web night sensing is unsupported, with an explanation', async () => {
    expect(await startNightSensing()).toEqual({
      status: 'unsupported',
      hint: 'Трекинг сна по датчикам работает только в приложении для Android: браузер не может слушать датчики ночью.',
    });
    expect(await readNightSamples()).toEqual([]);
    await expect(stopNightSensing()).resolves.toBeUndefined();
    await expect(clearNightSamples()).resolves.toBeUndefined();
  });

  it('on native without the sensors plugin night sensing is unsupported and reads nothing', async () => {
    mockNativePlatform('android');
    const sensors = mockNightSensors('granted');
    expect((await startNightSensing()).status).toBe('unsupported');
    expect(await readNightSamples()).toEqual([]);
    expect(sensors.bridge.getSamples).not.toHaveBeenCalled();
  });

  it('Given разрешения не даны When вызывается старт Then статус denied и объяснение, какие права нужны', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('prompt', 'denied');
    expect(await startNightSensing()).toEqual({
      status: 'denied',
      hint: 'Нужен доступ к микрофону: он измеряет только уровень шума ночью, звук не записывается и не сохраняется. Разрешите микрофон для LifeOS в настройках телефона.',
    });
    expect(sensors.bridge.requestPermissions).toHaveBeenCalledOnce();
    expect(sensors.running).toBe(false);
  });

  it('does not ask again when the microphone was already refused', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('denied');
    expect((await startNightSensing()).status).toBe('denied');
    expect(sensors.bridge.requestPermissions).not.toHaveBeenCalled();
  });

  it('reports a refused start as a status, not as an error', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sensors.bridge.start.mockRejectedValueOnce(new Error('service failed'));
    expect(await startNightSensing()).toEqual({
      status: 'failed',
      hint: 'Не удалось запустить трекинг сна. Попробуйте ещё раз.',
    });
  });

  it('drops malformed samples from the buffer instead of passing them on', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    sensors.bridge.getSamples.mockResolvedValueOnce({
      samples: [minute(0, 0.1), { minuteStart: 'x' }, { ...minute(2, Number.NaN) }, minute(3, 0.2)] as NightSample[],
    });
    expect(await readNightSamples()).toEqual([minute(0, 0.1), minute(3, 0.2)]);
  });

  it('Given тесты When прогоняются Then буфер агрегатов мокается; формат описан типом NightSample в src/core/types.ts', () => {
    expectTypeOf<NightSample>().toEqualTypeOf<{
      minuteStart: number;
      movement: number;
      noiseDb: number;
      noisePeakDb: number;
    }>();
    expectTypeOf<Awaited<ReturnType<SleepSensorsBridge['getSamples']>>>().toEqualTypeOf<{ samples: NightSample[] }>();
  });
});
