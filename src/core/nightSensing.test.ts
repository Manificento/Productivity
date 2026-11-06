import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { mockNativePlatform, mockNightSensors, resetPlatform } from '../test/platform';
import {
  clearNightSamples,
  isNightSensingActive,
  readNightSamples,
  startNightSensing,
  stopNightSensing,
  type SleepSensorsBridge,
} from './platform';
import type { NightSample } from './types';

const minute = (i: number, movement: number | null, noiseDb: number | null = -60): NightSample => ({
  minuteStart: new Date(2026, 10, 6, 23, i).getTime(),
  movement,
  movementPeak: movement === null ? null : movement * 3,
  noiseDb,
  noisePeakDb: noiseDb === null ? null : noiseDb + 10,
});

describe('night sensing', () => {
  it('Given src/core/platform.ts When модуль вызывает startNightSensing() и stopNightSensing() Then на нативе фоновая служба пишет агрегаты по минутам в буфер, который модуль читает утром; на вебе — unsupported', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');

    expect(await startNightSensing()).toEqual({ status: 'started' });
    expect(await isNightSensingActive()).toBe(true);
    // The native service writes one aggregate per minute while the app may be closed.
    sensors.record(minute(0, 0.02), minute(1, 0.4, -45));
    await stopNightSensing();
    expect(await isNightSensingActive()).toBe(false);

    // In the morning the module reads the buffer, saves what it needs and clears what it saved.
    const samples = await readNightSamples();
    expect(samples).toEqual([minute(0, 0.02), minute(1, 0.4, -45)]);
    await clearNightSamples(samples.at(-1)!.minuteStart);
    expect(await readNightSamples()).toEqual([]);

    resetPlatform();
    expect((await startNightSensing()).status).toBe('unsupported');
  });

  it('on the web night sensing is unsupported, with an explanation, and the rest does nothing', async () => {
    expect(await startNightSensing()).toEqual({
      status: 'unsupported',
      hint: 'Трекинг сна по датчикам работает только в приложении для Android: браузер не может слушать датчики ночью.',
    });
    expect(await readNightSamples()).toEqual([]);
    expect(await isNightSensingActive()).toBe(false);
    await expect(stopNightSensing()).resolves.toBeUndefined();
    await expect(clearNightSamples(0)).resolves.toBeUndefined();
  });

  it('on native without the sensors plugin night sensing is unsupported and reads nothing', async () => {
    mockNativePlatform('android');
    const sensors = mockNightSensors('granted');
    expect((await startNightSensing()).status).toBe('unsupported');
    expect(await readNightSamples()).toEqual([]);
    expect(sensors.bridge.getSamples).not.toHaveBeenCalled();
  });

  it('clearing up to the last saved minute keeps a minute written after the morning read', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    await startNightSensing();
    sensors.record(minute(0, 0.1), minute(1, 0.1));
    const read = await readNightSamples();
    sensors.record(minute(2, 0.3)); // the service is still running
    await clearNightSamples(read.at(-1)!.minuteStart);
    expect(await readNightSamples()).toEqual([minute(2, 0.3)]);
    expect(sensors.bridge.clearSamples).toHaveBeenCalledWith({ upTo: minute(1, 0).minuteStart });
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

  it('reports a refused start as a status; stop and the activity check never reject', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sensors.bridge.start.mockRejectedValueOnce(new Error('service failed'));
    expect(await startNightSensing()).toEqual({
      status: 'failed',
      hint: 'Не удалось запустить трекинг сна. Попробуйте ещё раз.',
    });
    sensors.bridge.stop.mockRejectedValueOnce(new Error('gone'));
    await expect(stopNightSensing()).resolves.toBeUndefined();
    sensors.bridge.isActive.mockRejectedValueOnce(new Error('gone'));
    expect(await isNightSensingActive()).toBe(false);
  });

  it('keeps «no readings» (null) apart from «still» and «silence», and drops malformed samples', async () => {
    mockNativePlatform('android', ['backgroundSensors']);
    const sensors = mockNightSensors('granted');
    sensors.bridge.getSamples.mockResolvedValueOnce({
      samples: [
        minute(0, 0),
        minute(1, null, null),
        { minuteStart: 'x' },
        minute(3, Number.NaN),
        { ...minute(4, 0.2), noiseDb: undefined },
        minute(5, 0.2),
      ] as NightSample[],
    });
    expect(await readNightSamples()).toEqual([minute(0, 0), minute(1, null, null), minute(5, 0.2)]);
  });

  it('Given тесты When прогоняются Then буфер агрегатов мокается; формат описан типом NightSample в src/core/types.ts', () => {
    expectTypeOf<NightSample>().toEqualTypeOf<{
      minuteStart: number;
      movement: number | null;
      movementPeak: number | null;
      noiseDb: number | null;
      noisePeakDb: number | null;
    }>();
    expectTypeOf<Awaited<ReturnType<SleepSensorsBridge['getSamples']>>>().toEqualTypeOf<{ samples: NightSample[] }>();
  });
});
