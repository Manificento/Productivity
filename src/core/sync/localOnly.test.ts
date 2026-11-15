import { describe, expect, it } from 'vitest';
import { DEVICE_ID_KEY, isLocalOnlySetting, LOCAL_ONLY_SETTING_KEYS } from './localOnly';

describe('contract #274: ключи состояния устройства', () => {
  it('Given список ключей состояния устройства (adaptation.morning, adaptation.onboardingDone, device.id, time.pomodoro.running) When читаю src/core/sync/localOnly.ts Then они перечислены', () => {
    expect([...LOCAL_ONLY_SETTING_KEYS].sort()).toEqual([
      'adaptation.morning',
      'adaptation.onboardingDone',
      'device.id',
      'time.pomodoro.running',
    ]);
    expect(DEVICE_ID_KEY).toBe('device.id');
    for (const key of LOCAL_ONLY_SETTING_KEYS) expect(isLocalOnlySetting(key)).toBe(true);
  });

  it('настройки пользователя синхронизируются: adaptation.baseline, time.pomodoro и ключи с похожим началом — не состояние устройства', () => {
    for (const key of ['adaptation.baseline', 'time.pomodoro', 'theme', 'adaptation.morning.extra', 'device.idx']) {
      expect(isLocalOnlySetting(key)).toBe(false);
    }
    // Keys of other tables are not settings keys: anything that is not a string is never local-only.
    expect(isLocalOnlySetting(42)).toBe(false);
  });
});
