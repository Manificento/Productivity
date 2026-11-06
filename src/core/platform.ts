import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationsPlugin } from '@capacitor/local-notifications';

/**
 * The only door to the native platform (ADR-0008). Modules never import `@capacitor/*` — `npm run deps` forbids it —
 * they ask here what the current platform can do and explain an unavailable feature instead of hiding it.
 */

export type PlatformName = 'web' | 'android' | 'ios';

export type Capability = 'alarms' | 'backgroundSensors' | 'healthImport' | 'notifications';

export type Capabilities = Readonly<Record<Capability, boolean>>;

/**
 * Native plugin that provides each capability. The contract issue that adds a plugin (notifications, alarm,
 * sleep sensors, Health Connect / HealthKit) sets its registered name here.
 */
export const CAPABILITY_PLUGINS: Readonly<Record<Capability, string>> = {
  alarms: 'Alarm',
  backgroundSensors: 'SleepSensors',
  healthImport: 'Health',
  notifications: 'LocalNotifications',
};

const CAPABILITIES = Object.keys(CAPABILITY_PLUGINS) as Capability[];

/** What `platform.ts` needs from the native bridge; `Capacitor` itself in the app, a fake in tests. */
export interface PlatformRuntime {
  getPlatform(): string;
  isPluginAvailable(name: string): boolean;
}

let runtime: PlatformRuntime = Capacitor;

/** Tests swap the bridge through `src/test/platform.ts`; app code never calls this. */
export function setPlatformRuntime(next: PlatformRuntime | null): void {
  runtime = next ?? Capacitor;
}

export function getPlatform(): PlatformName {
  const name = runtime.getPlatform();
  return name === 'android' || name === 'ios' ? name : 'web';
}

export function isNativePlatform(): boolean {
  return getPlatform() !== 'web';
}

/**
 * Capability flags for the current platform: all `false` on the web (even where a plugin ships a web fallback),
 * on native — whether the providing plugin is installed.
 */
export function getCapabilities(): Capabilities {
  const native = isNativePlatform();
  const flags = {} as Record<Capability, boolean>;
  for (const capability of CAPABILITIES) {
    flags[capability] = native && runtime.isPluginAvailable(CAPABILITY_PLUGINS[capability]);
  }
  return flags;
}

// ---------- reminders (local notifications) ----------

/** A reminder about a task, a habit, bedtime…: `id` is the module's record id (reused to replace or cancel it). */
export interface Reminder {
  id: string;
  title: string;
  body?: string;
  at: Date;
}

/**
 * `scheduled` — will fire (on the web only while the tab is open: see `limitation`);
 * `denied` — the user has not allowed notifications; `unsupported` — this platform cannot show them.
 * `hint` / `limitation` are ready-to-show Russian texts for the module's UI.
 */
export type ReminderResult =
  | { status: 'scheduled'; limitation?: string }
  | { status: 'denied'; hint: string }
  | { status: 'unsupported'; hint: string };

export const REMINDER_TEXTS = {
  webLimitation: 'В браузере напоминание сработает, только пока вкладка открыта.',
  webUnsupported: 'Этот браузер не показывает уведомления. Напоминания работают в приложении для Android.',
  webDenied: 'Уведомления заблокированы. Разрешите их для этого сайта в настройках браузера.',
  nativeDenied: 'Уведомления выключены. Разрешите их для LifeOS в настройках телефона.',
  nativeUnsupported: 'Уведомления недоступны в этой версии приложения. Обновите приложение.',
} as const;

/** What reminders need from the native LocalNotifications plugin; the plugin itself in the app, a fake in tests. */
export type LocalNotificationsBridge = Pick<
  LocalNotificationsPlugin,
  'checkPermissions' | 'requestPermissions' | 'schedule' | 'cancel'
>;

let localNotifications: LocalNotificationsBridge = LocalNotifications;

/** Tests swap the plugin through `src/test/platform.ts`; app code never calls this. */
export function setLocalNotificationsBridge(next: LocalNotificationsBridge | null): void {
  localNotifications = next ?? LocalNotifications;
}

/** Stable positive 32-bit id for the native plugin (it wants an int) from a record id: FNV-1a. */
export function reminderNotificationId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 1 || 1;
}

/** Pending web reminders by record id: browser timers live only while the tab is open. */
const webTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** `setTimeout` overflows above 2^31 − 1 ms (~24.8 days): longer waits are chained. */
const MAX_TIMER_MS = 0x7fffffff;

function clearWebTimer(id: string): void {
  const timer = webTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  webTimers.delete(id);
}

function armWebTimer(reminder: Reminder): void {
  const wait = reminder.at.getTime() - Date.now();
  const timer = setTimeout(
    () => {
      if (wait > MAX_TIMER_MS) return armWebTimer(reminder);
      webTimers.delete(reminder.id);
      new Notification(reminder.title, { body: reminder.body, tag: reminder.id });
    },
    Math.min(Math.max(0, wait), MAX_TIMER_MS),
  );
  webTimers.set(reminder.id, timer);
}

async function scheduleNative(reminder: Reminder): Promise<ReminderResult> {
  if (!getCapabilities().notifications) return { status: 'unsupported', hint: REMINDER_TEXTS.nativeUnsupported };
  let { display } = await localNotifications.checkPermissions();
  if (display === 'prompt' || display === 'prompt-with-rationale')
    ({ display } = await localNotifications.requestPermissions());
  if (display !== 'granted') return { status: 'denied', hint: REMINDER_TEXTS.nativeDenied };
  await localNotifications.schedule({
    notifications: [
      {
        id: reminderNotificationId(reminder.id),
        title: reminder.title,
        body: reminder.body ?? '',
        // The OS fires it even when the app is closed; allowed in Doze (at most once per 9 minutes per app).
        schedule: { at: reminder.at, allowWhileIdle: true },
        // Exact alarms would open the system «Alarms & reminders» screen on every schedule until granted;
        // a reminder may come a few minutes late instead.
        isExactNotification: false,
      },
    ],
  });
  return { status: 'scheduled' };
}

async function scheduleWeb(reminder: Reminder): Promise<ReminderResult> {
  if (typeof Notification === 'undefined') return { status: 'unsupported', hint: REMINDER_TEXTS.webUnsupported };
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied', hint: REMINDER_TEXTS.webDenied };
  clearWebTimer(reminder.id);
  armWebTimer(reminder);
  return { status: 'scheduled', limitation: REMINDER_TEXTS.webLimitation };
}

/**
 * The one way to remind the user (a task, a habit, bedtime) on any platform. Native: a local notification
 * scheduled with the OS, delivered while the app is closed. Web: the Notification API while the tab is open.
 * The same `id` again replaces the earlier reminder. Asks for the permission once, if it was not decided.
 */
export async function scheduleReminder(reminder: Reminder): Promise<ReminderResult> {
  return isNativePlatform() ? scheduleNative(reminder) : scheduleWeb(reminder);
}

/** Cancels the reminder of a record (e.g. the record was deleted). Unknown ids are ignored. */
export async function cancelReminder(id: string): Promise<void> {
  clearWebTimer(id);
  if (isNativePlatform() && getCapabilities().notifications) {
    await localNotifications.cancel({ notifications: [{ id: reminderNotificationId(id) }] });
  }
}
