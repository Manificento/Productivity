/**
 * `settings` keys that describe THIS DEVICE, not the user (ADR-0009, sync p. 7): they never go to `syncOutbox`,
 * so they are never pushed to the cloud. Everything else in `settings` is the user's preference and is synced.
 *
 * A module that adds a per-device key adds it here in a `type:contract` issue. Keys are matched exactly.
 */

/** UUID of this installation, created on first open; the `updated_by` of everything this device pushes. */
export const DEVICE_ID_KEY = 'device.id';

export const LOCAL_ONLY_SETTING_KEYS: readonly string[] = [
  // today: steps of the morning flow skipped on this device today.
  'adaptation.morning',
  // today: onboarding was shown on this device.
  'adaptation.onboardingDone',
  DEVICE_ID_KEY,
  // time: the Pomodoro phase running on this device right now.
  'time.pomodoro.running',
];

const LOCAL_ONLY = new Set<unknown>(LOCAL_ONLY_SETTING_KEYS);

/** Whether a `settings` key is device state that must stay on the device. */
export function isLocalOnlySetting(key: unknown): boolean {
  return LOCAL_ONLY.has(key);
}
