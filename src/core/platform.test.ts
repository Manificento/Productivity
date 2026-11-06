import { describe, expect, it } from 'vitest';
import { mockNativePlatform, resetPlatform } from '../test/platform';
import { getCapabilities, getPlatform, isNativePlatform, setPlatformRuntime } from './platform';

const ALL_OFF = { alarms: false, backgroundSensors: false, healthImport: false, notifications: false };

describe('platform.ts: флаги возможностей false на вебе и по плагинам на нативе', () => {
  it('на вебе все флаги false', () => {
    expect(getPlatform()).toBe('web');
    expect(isNativePlatform()).toBe(false);
    expect(getCapabilities()).toEqual(ALL_OFF);
  });

  it('на вебе флаг false, даже если у плагина есть веб-реализация', () => {
    setPlatformRuntime({ getPlatform: () => 'web', isPluginAvailable: () => true });
    expect(getCapabilities()).toEqual(ALL_OFF);
  });

  it('на нативе флаг true только для установленного плагина', () => {
    mockNativePlatform('android', ['notifications', 'alarms']);
    expect(getPlatform()).toBe('android');
    expect(isNativePlatform()).toBe(true);
    expect(getCapabilities()).toEqual({ ...ALL_OFF, notifications: true, alarms: true });
  });

  it('на нативе без плагинов все флаги false', () => {
    mockNativePlatform('ios');
    expect(getPlatform()).toBe('ios');
    expect(getCapabilities()).toEqual(ALL_OFF);
  });

  it('неизвестная платформа считается вебом', () => {
    setPlatformRuntime({ getPlatform: () => 'electron', isPluginAvailable: () => true });
    expect(getPlatform()).toBe('web');
    expect(getCapabilities()).toEqual(ALL_OFF);
  });

  it('в тестах мокаются: сброс возвращает настоящую платформу (веб)', () => {
    mockNativePlatform('android', ['alarms']);
    resetPlatform(); // what src/test/setup.ts runs after every test
    expect(getPlatform()).toBe('web');
    expect(getCapabilities()).toEqual(ALL_OFF);
  });
});
