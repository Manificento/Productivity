/**
 * `settings` keys that describe THIS DEVICE, not the user (ADR-0009, sync p. 7): they never go to `syncOutbox`,
 * so they are never pushed to the cloud. Everything else in `settings` is the user's preference and is synced.
 *
 * A module that adds a per-device key adds it here in a `type:contract` issue. Keys are matched exactly.
 */

/** UUID of this installation, created on first open; the `updated_by` of everything this device pushes. */
export const DEVICE_ID_KEY = 'device.id';

/**
 * The account on this device (`core/account/`): the pending sign-in or the session with its tokens. The tokens are
 * credentials of this installation — never synced, never written to a backup, never logged.
 */
export const ACCOUNT_SESSION_KEY = 'account.session';

/** The user's consents as the server last told them — a cache, so they can be read offline (`core/account/`). */
export const ACCOUNT_CONSENTS_KEY = 'account.consents';

export const LOCAL_ONLY_SETTING_KEYS: readonly string[] = [
  ACCOUNT_CONSENTS_KEY,
  ACCOUNT_SESSION_KEY,
  // today: steps of the morning flow skipped on this device today.
  'adaptation.morning',
  // today: onboarding was shown on this device.
  'adaptation.onboardingDone',
  DEVICE_ID_KEY,
  // time: the Pomodoro phase running on this device right now.
  'time.pomodoro.running',
];

const LOCAL_ONLY = new Set<unknown>(LOCAL_ONLY_SETTING_KEYS);

/**
 * Device-state keys that belong to THIS INSTALLATION and to nobody's data: a backup never carries them and an
 * import never replaces them (`core/backup.ts`). The other device-state keys are exported on purpose, so that a
 * restore on the same phone does not, for example, show onboarding again.
 */
export const INSTALLATION_SETTING_KEYS: readonly string[] = [DEVICE_ID_KEY, ACCOUNT_SESSION_KEY, ACCOUNT_CONSENTS_KEY];

const INSTALLATION = new Set<unknown>(INSTALLATION_SETTING_KEYS);

/** Whether a `settings` key is device state that must stay on the device. */
export function isLocalOnlySetting(key: unknown): boolean {
  return LOCAL_ONLY.has(key);
}

/** Whether a `settings` key belongs to the installation: kept out of backups and kept through an import. */
export function isInstallationSetting(key: unknown): boolean {
  return INSTALLATION.has(key);
}
