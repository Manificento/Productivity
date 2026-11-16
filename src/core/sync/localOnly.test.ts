import { describe, expect, it } from 'vitest';
import {
  DEVICE_ID_KEY,
  INSTALLATION_SETTING_KEYS,
  isInstallationSetting,
  isLocalOnlySetting,
  LOCAL_ONLY_SETTING_KEYS,
} from './localOnly';

const ACCOUNT_KEYS = ['account.consents', 'account.session'];

describe('contract #274: ключи состояния устройства', () => {
  it('Given список ключей состояния устройства (adaptation.morning, adaptation.onboardingDone, device.id, time.pomodoro.running) When читаю src/core/sync/localOnly.ts Then они перечислены', () => {
    const keys = ['adaptation.morning', 'adaptation.onboardingDone', 'device.id', 'time.pomodoro.running'];
    // The keys later contracts added are checked by their own tests below.
    expect(LOCAL_ONLY_SETTING_KEYS.filter((key) => !ACCOUNT_KEYS.includes(key)).toSorted()).toEqual(keys);
    expect(DEVICE_ID_KEY).toBe('device.id');
    for (const key of LOCAL_ONLY_SETTING_KEYS) expect(isLocalOnlySetting(key)).toBe(true);
  });

  it('contract #278: account.session и account.consents — ключи установки: не в очереди синхронизации, не в экспорте, сохраняются при импорте', () => {
    for (const key of ACCOUNT_KEYS) {
      expect(isLocalOnlySetting(key)).toBe(true);
      expect(isInstallationSetting(key)).toBe(true);
    }
    expect(LOCAL_ONLY_SETTING_KEYS.filter((key) => key.startsWith('account.')).toSorted()).toEqual(ACCOUNT_KEYS);
    // Keys of the installation: `device.id` (#274) and the two of the account. The other device-state keys are
    // exported on purpose (a restore on the same phone does not show onboarding again).
    expect([...INSTALLATION_SETTING_KEYS].toSorted()).toEqual([...ACCOUNT_KEYS, 'device.id']);
    for (const key of INSTALLATION_SETTING_KEYS) expect(isLocalOnlySetting(key)).toBe(true);
    for (const key of [
      'adaptation.morning',
      'adaptation.onboardingDone',
      'time.pomodoro.running',
      'account.sessions',
    ]) {
      expect(isInstallationSetting(key)).toBe(false);
    }
  });

  it('настройки пользователя синхронизируются: adaptation.baseline, time.pomodoro и ключи с похожим началом — не состояние устройства', () => {
    for (const key of ['adaptation.baseline', 'time.pomodoro', 'theme', 'adaptation.morning.extra', 'device.idx']) {
      expect(isLocalOnlySetting(key)).toBe(false);
    }
    // Keys of other tables are not settings keys: anything that is not a string is never local-only.
    expect(isLocalOnlySetting(42)).toBe(false);
  });
});
