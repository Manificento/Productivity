import { Capacitor, registerPlugin, type PermissionState } from '@capacitor/core';
import { Health, type HealthPlugin } from '@capgo/capacitor-health';
import { LocalNotifications, type LocalNotificationsPlugin } from '@capacitor/local-notifications';
import { fromDateKey, shiftDateKey, toDateKey } from './dates';
import { toImportedWorkouts, toSleepNights, type StoreSleepSample, type StoreWorkout } from './healthImport';
import { atLocalTime } from './logging/sleepTime';
import type { DateKey, ImportedSleep, ImportedWorkout, Millis, NightSample } from './types';

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

/**
 * A reminder about a task, a habit, bedtime…: `id` is `<module>:<recordId>` (e.g. `habits:<id>`, `sleep:bedtime`),
 * unique across modules; the same `id` replaces or cancels the reminder.
 */
export interface Reminder {
  id: string;
  title: string;
  body?: string;
  at: Date;
}

/**
 * `scheduled` — will fire (`limitation`: why it may not fire on time); `denied` — the user has not allowed
 * notifications; `unsupported` — this platform cannot show them; `failed` — the system refused, try again.
 * `hint` / `limitation` are ready-to-show Russian texts for the module's UI.
 */
export type ReminderResult =
  | { status: 'scheduled'; limitation?: string }
  | { status: 'denied'; hint: string }
  | { status: 'unsupported'; hint: string }
  | { status: 'failed'; hint: string };

export const REMINDER_TEXTS = {
  webLimitation: 'В браузере напоминание сработает, только пока вкладка открыта.',
  webUnsupported: 'Этот браузер не показывает уведомления. Напоминания работают в приложении для Android.',
  webDenied: 'Уведомления заблокированы. Разрешите их для этого сайта в настройках браузера.',
  nativeDenied: 'Уведомления выключены. Разрешите их для LifeOS в настройках телефона.',
  nativeUnsupported: 'Уведомления недоступны в этой версии приложения. Обновите приложение.',
  inexact:
    'Напоминание может прийти с опозданием до часа. Включите «Будильники и напоминания» для LifeOS в настройках.',
  failed: 'Не удалось запланировать напоминание. Попробуйте ещё раз.',
} as const;

/** What reminders need from the native LocalNotifications plugin; the plugin itself in the app, a fake in tests. */
export type LocalNotificationsBridge = Pick<
  LocalNotificationsPlugin,
  'checkPermissions' | 'requestPermissions' | 'checkExactNotificationSetting' | 'schedule' | 'cancel'
>;

let localNotifications: LocalNotificationsBridge = LocalNotifications;

/** Tests swap the plugin through `src/test/platform.ts`; app code never calls this. */
export function setLocalNotificationsBridge(next: LocalNotificationsBridge | null): void {
  localNotifications = next ?? LocalNotifications;
}

/** Stable positive 32-bit id for the native plugin (it wants an int) from a reminder id: FNV-1a. */
export function reminderNotificationId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 1 || 1;
}

/** Pending web reminders by id: browser timers live only while the tab is open. */
const webTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** `setTimeout` overflows above 2^31 − 1 ms (~24.8 days): longer waits are chained. */
const MAX_TIMER_MS = 0x7fffffff;
/**
 * Bumped by every schedule and cancel of an id: a schedule still waiting for a permission answer is dropped
 * when a later call for the same id came in meanwhile (a cancel must not be overtaken by an earlier schedule).
 */
const generations = new Map<string, number>();

function nextGeneration(id: string): number {
  const generation = (generations.get(id) ?? 0) + 1;
  generations.set(id, generation);
  return generation;
}

function clearWebTimer(id: string): void {
  const timer = webTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  webTimers.delete(id);
}

/** Tests: forget every pending web reminder (called by `resetPlatform()`). */
export function clearWebReminders(): void {
  for (const id of [...webTimers.keys()]) clearWebTimer(id);
  generations.clear();
}

/** Android Chrome forbids `new Notification()`: it shows notifications only through the service worker. */
async function showWebNotification(reminder: Reminder): Promise<void> {
  const options = { body: reminder.body, tag: reminder.id };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) return await registration.showNotification(reminder.title, options);
  } catch {
    // No active worker yet (first load): try the constructor below.
  }
  try {
    new Notification(reminder.title, options);
  } catch (e) {
    console.error('reminder notification failed', e);
  }
}

function armWebTimer(reminder: Reminder): void {
  const wait = reminder.at.getTime() - Date.now();
  const timer = setTimeout(
    () => {
      if (wait > MAX_TIMER_MS) return armWebTimer(reminder);
      webTimers.delete(reminder.id);
      void showWebNotification(reminder);
    },
    Math.min(Math.max(0, wait), MAX_TIMER_MS),
  );
  webTimers.set(reminder.id, timer);
}

/** The plugin rejects with this code when notifications were switched off in the system settings. */
const NOTIFICATIONS_DISABLED = 'OS-PLUG-LNOT-0005';

async function scheduleNative(reminder: Reminder, generation: number): Promise<ReminderResult> {
  if (!getCapabilities().notifications) return { status: 'unsupported', hint: REMINDER_TEXTS.nativeUnsupported };
  try {
    let { display } = await localNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      ({ display } = await localNotifications.requestPermissions());
    }
    if (display !== 'granted') return { status: 'denied', hint: REMINDER_TEXTS.nativeDenied };
    // Exact only where the phone allows it: asking for an exact alarm without the permission would open the
    // system «Alarms & reminders» screen on every schedule. iOS has no such setting and is always exact.
    const exact =
      getPlatform() !== 'android' ||
      (await localNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
    if (generations.get(reminder.id) !== generation) return { status: 'scheduled' };
    await localNotifications.schedule({
      notifications: [
        {
          id: reminderNotificationId(reminder.id),
          title: reminder.title,
          body: reminder.body ?? '',
          // The OS fires it even when the app is closed (and restores it after a reboot); allowed in Doze.
          schedule: { at: reminder.at, allowWhileIdle: true },
          isExactNotification: exact,
        },
      ],
    });
    return exact ? { status: 'scheduled' } : { status: 'scheduled', limitation: REMINDER_TEXTS.inexact };
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === NOTIFICATIONS_DISABLED || String(e).includes(NOTIFICATIONS_DISABLED)) {
      return { status: 'denied', hint: REMINDER_TEXTS.nativeDenied };
    }
    console.error('scheduleReminder failed', e);
    return { status: 'failed', hint: REMINDER_TEXTS.failed };
  }
}

async function scheduleWeb(reminder: Reminder, generation: number): Promise<ReminderResult> {
  if (typeof Notification === 'undefined') return { status: 'unsupported', hint: REMINDER_TEXTS.webUnsupported };
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied', hint: REMINDER_TEXTS.webDenied };
  if (generations.get(reminder.id) === generation) {
    clearWebTimer(reminder.id);
    armWebTimer(reminder);
  }
  return { status: 'scheduled', limitation: REMINDER_TEXTS.webLimitation };
}

/**
 * The one way to remind the user (a task, a habit, bedtime) on any platform. Native: a local notification
 * scheduled with the OS, delivered while the app is closed. Web: the Notification API while the tab is open.
 * Web timers are lost on reload and Android drops exact reminders when «Alarms & reminders» is revoked, so a module
 * schedules its pending reminders again when the app starts, on every platform (the same `id` replaces).
 * Asks for the permission once, if it was not decided. A schedule overtaken by a later call for the same `id`
 * (e.g. a cancel) is dropped and still reports `scheduled`: the later call decides.
 * Never rejects for platform reasons (see `ReminderResult`); an invalid `at` is a bug and throws `RangeError`.
 */
export async function scheduleReminder(reminder: Reminder): Promise<ReminderResult> {
  if (Number.isNaN(reminder.at.getTime())) throw new RangeError(`Invalid reminder time for ${reminder.id}`);
  const generation = nextGeneration(reminder.id);
  return isNativePlatform() ? scheduleNative(reminder, generation) : scheduleWeb(reminder, generation);
}

/** Cancels a reminder (e.g. its record was deleted). Unknown ids are ignored; a failed cancel is logged. */
export async function cancelReminder(id: string): Promise<void> {
  nextGeneration(id);
  clearWebTimer(id);
  if (isNativePlatform() && getCapabilities().notifications) {
    try {
      await localNotifications.cancel({ notifications: [{ id: reminderNotificationId(id) }] });
    } catch (e) {
      console.error('cancelReminder failed', e);
    }
  }
}

// ---------- night sensing (background accelerometer + microphone) ----------

/** The app's own native plugin (`android/…/SleepSensorsPlugin.java`): a foreground service writes minute aggregates. */
export interface SleepSensorsBridge {
  checkPermissions(): Promise<{ microphone: PermissionState }>;
  requestPermissions(): Promise<{ microphone: PermissionState }>;
  /** Starts the foreground service; it keeps writing one `NightSample` per minute until `stop()`. */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Whether the service is recording now (the OS may have ended it). */
  isActive(): Promise<{ active: boolean }>;
  /** The buffer of minute aggregates, oldest first (at most the newest two nights). */
  getSamples(): Promise<{ samples: NightSample[] }>;
  /** Removes the minutes with `minuteStart <= upTo`. */
  clearSamples(options: { upTo: Millis }): Promise<void>;
}

const SleepSensors = registerPlugin<SleepSensorsBridge>(CAPABILITY_PLUGINS.backgroundSensors);
let sleepSensors: SleepSensorsBridge = SleepSensors;

/** Tests swap the plugin through `src/test/platform.ts`; app code never calls this. */
export function setSleepSensorsBridge(next: SleepSensorsBridge | null): void {
  sleepSensors = next ?? SleepSensors;
}

export type NightSensingResult =
  | { status: 'started' }
  | { status: 'denied'; hint: string }
  | { status: 'unsupported'; hint: string }
  | { status: 'failed'; hint: string };

export const NIGHT_SENSING_TEXTS = {
  web: 'Трекинг сна по датчикам работает только в приложении для Android: браузер не может слушать датчики ночью.',
  nativeUnsupported: 'Трекинг сна по датчикам недоступен в этой версии приложения. Обновите приложение.',
  denied:
    'Нужен доступ к микрофону: он измеряет только уровень шума ночью, звук не записывается и не сохраняется. Разрешите микрофон для LifeOS в настройках телефона.',
  failed: 'Не удалось запустить трекинг сна. Попробуйте ещё раз.',
} as const;

const sensorsAvailable = () => isNativePlatform() && getCapabilities().backgroundSensors;

/**
 * Starts night sensing: a native foreground service records movement (accelerometer) and the noise level
 * (microphone, levels only) and writes one `NightSample` per minute, also while the app is closed.
 * Call it from a user action while the app is open: Android 14+ starts a microphone service only then.
 * Asks for the microphone once, if it was not decided. Never rejects: the result says what happened.
 * `started` means the service was asked to start; confirm with `isNightSensingActive()` a moment later.
 */
export async function startNightSensing(): Promise<NightSensingResult> {
  if (!isNativePlatform()) return { status: 'unsupported', hint: NIGHT_SENSING_TEXTS.web };
  if (!sensorsAvailable()) return { status: 'unsupported', hint: NIGHT_SENSING_TEXTS.nativeUnsupported };
  try {
    let { microphone } = await sleepSensors.checkPermissions();
    if (microphone === 'prompt' || microphone === 'prompt-with-rationale') {
      ({ microphone } = await sleepSensors.requestPermissions());
    }
    if (microphone !== 'granted') return { status: 'denied', hint: NIGHT_SENSING_TEXTS.denied };
    await sleepSensors.start();
    return { status: 'started' };
  } catch (e) {
    console.error('startNightSensing failed', e);
    return { status: 'failed', hint: NIGHT_SENSING_TEXTS.failed };
  }
}

/** Stops the service; the buffer stays. Never rejects (a failure is logged). */
export async function stopNightSensing(): Promise<void> {
  if (!sensorsAvailable()) return;
  try {
    await sleepSensors.stop();
  } catch (e) {
    console.error('stopNightSensing failed', e);
  }
}

/**
 * Whether a night is being recorded now — e.g. after the app was restarted. The OS may end the service at night,
 * then this turns `false` and the buffer simply stops. `false` on the web; never rejects.
 */
export async function isNightSensingActive(): Promise<boolean> {
  if (!sensorsAvailable()) return false;
  try {
    return (await sleepSensors.isActive()).active;
  } catch (e) {
    console.error('isNightSensingActive failed', e);
    return false;
  }
}

const isLevel = (n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n));
const isSample = (s: unknown): s is NightSample => {
  const v = s as Partial<NightSample> | null;
  return (
    !!v &&
    typeof v.minuteStart === 'number' &&
    Number.isFinite(v.minuteStart) &&
    [v.movement, v.movementPeak, v.noiseDb, v.noisePeakDb].every(isLevel)
  );
};

/**
 * The minute aggregates recorded so far, oldest first (read them in the morning); malformed entries are dropped.
 * `[]` where sensing is unavailable. Rejects if the native buffer cannot be read — then do not clear it.
 */
export async function readNightSamples(): Promise<NightSample[]> {
  if (!sensorsAvailable()) return [];
  const { samples } = await sleepSensors.getSamples();
  return (samples ?? []).filter(isSample);
}

/**
 * Removes the minutes up to `upTo` (the last `minuteStart` the module saved), so a minute written by the
 * still-running service after the read is kept. Rejects if the native buffer cannot be written.
 */
export async function clearNightSamples(upTo: Millis): Promise<void> {
  if (sensorsAvailable()) await sleepSensors.clearSamples({ upTo });
}

// ---------- health store import (Health Connect / HealthKit) ----------

/** What the import needs from the health plugin; `@capgo/capacitor-health` in the app, a fake in tests. */
export type HealthStoreBridge = Pick<
  HealthPlugin,
  | 'isAvailable'
  | 'checkAuthorization'
  | 'requestAuthorization'
  | 'readSamples'
  | 'queryWorkouts'
  | 'openHealthConnectSettings'
>;

let healthStore: HealthStoreBridge = Health;
let accessRequest: Promise<HealthAccessResult> | undefined;

/** Tests swap the plugin through `src/test/platform.ts`; app code never calls this. */
export function setHealthStoreBridge(next: HealthStoreBridge | null): void {
  healthStore = next ?? Health;
  accessRequest = undefined;
}

/**
 * `ok` with the records (possibly none), or why nothing could be read, with a ready-to-show Russian `hint`.
 * On iOS an `ok` without records may carry a `hint`: HealthKit never tells whether reading was refused.
 */
export type HealthReadResult<T> =
  | { status: 'ok'; items: T[]; hint?: string }
  | { status: 'denied'; hint: string }
  | { status: 'unsupported'; hint: string }
  | { status: 'failed'; hint: string };

export type HealthAccessResult =
  | { status: 'granted' }
  | { status: 'denied'; hint: string }
  | { status: 'unsupported'; hint: string }
  | { status: 'failed'; hint: string };

export const HEALTH_TEXTS = {
  web: 'Импорт из Health Connect и Apple Health работает только в приложении для телефона.',
  nativeUnsupported: 'Импорт данных о здоровье недоступен в этой версии приложения. Обновите приложение.',
  updateHealthConnect: 'Обновите «Health Connect» в Google Play, чтобы LifeOS мог читать сон и тренировки.',
  noHealthConnectOnDevice: 'Health Connect недоступен на этом телефоне: нужен Android 9 или новее.',
  noHealthConnect: 'Health Connect недоступен. Установите или обновите его в Google Play.',
  noHealthKit: 'Приложение «Здоровье» недоступно на этом устройстве.',
  deniedAndroid: 'Нет доступа к сну и тренировкам. Разрешите их LifeOS в настройках Health Connect.',
  askIos: 'Разрешите LifeOS читать сон и тренировки из приложения «Здоровье».',
  maybeDeniedIos: 'Данных нет. Если вы не разрешили доступ: Настройки → Здоровье → Доступ к данным → LifeOS.',
  tooMuch: 'Слишком много записей за этот период. Выберите период короче.',
  failed: 'Не удалось прочитать данные о здоровье. Попробуйте ещё раз.',
} as const;

const HEALTH_KINDS = ['sleep', 'workouts'] as const;
type HealthDataKind = (typeof HEALTH_KINDS)[number];
/** Sleep is read a week at a time; a week never has this many samples, so hitting it means data would be lost. */
const SLEEP_CHUNK_DAYS = 7;
const SLEEP_CHUNK_LIMIT = 2000;
const WORKOUT_PAGE = 100;
/** About 2000 workouts per read; more is reported as `failed` instead of being cut silently. */
const MAX_WORKOUT_PAGES = 20;

class TooMuchHealthData extends Error {}

async function unavailable(): Promise<{ status: 'unsupported'; hint: string } | undefined> {
  if (!isNativePlatform()) return { status: 'unsupported', hint: HEALTH_TEXTS.web };
  if (!getCapabilities().healthImport) return { status: 'unsupported', hint: HEALTH_TEXTS.nativeUnsupported };
  const { available, reason = '' } = await healthStore.isAvailable();
  if (available) return undefined;
  if (getPlatform() !== 'android') return { status: 'unsupported', hint: HEALTH_TEXTS.noHealthKit };
  if (/update/i.test(reason)) return { status: 'unsupported', hint: HEALTH_TEXTS.updateHealthConnect };
  if (/unavailable on this device/i.test(reason)) {
    return { status: 'unsupported', hint: HEALTH_TEXTS.noHealthConnectOnDevice };
  }
  return { status: 'unsupported', hint: HEALTH_TEXTS.noHealthConnect };
}

const deniedHint = () => (getPlatform() === 'android' ? HEALTH_TEXTS.deniedAndroid : HEALTH_TEXTS.askIos);

/**
 * Shows the system access sheet once for both sleep and workouts (call it from a user action, e.g. «Подключить»).
 * Concurrent calls share one sheet. On iOS `granted` only means the sheet was answered: HealthKit hides refusals.
 */
export function requestHealthAccess(): Promise<HealthAccessResult> {
  accessRequest ??= (async (): Promise<HealthAccessResult> => {
    try {
      const blocked = await unavailable();
      if (blocked) return blocked;
      const status = await healthStore.requestAuthorization({ read: [...HEALTH_KINDS] });
      return HEALTH_KINDS.every((k) => status.readAuthorized.includes(k))
        ? { status: 'granted' }
        : { status: 'denied', hint: deniedHint() };
    } catch (e) {
      // iOS rejects when the sheet could not be completed.
      if (/not granted/i.test(String(e))) return { status: 'denied', hint: deniedHint() };
      console.error('requestHealthAccess failed', e);
      return { status: 'failed', hint: HEALTH_TEXTS.failed };
    }
  })().finally(() => {
    accessRequest = undefined;
  });
  return accessRequest;
}

/** Opens the Health Connect settings (Android) so the user can allow access; `false` where there are none. */
export async function openHealthSettings(): Promise<boolean> {
  if (getPlatform() !== 'android' || !getCapabilities().healthImport) return false;
  try {
    await healthStore.openHealthConnectSettings();
    return true;
  } catch (e) {
    console.error('openHealthSettings failed', e);
    return false;
  }
}

async function readHealth<T>(
  kind: HealthDataKind,
  from: DateKey,
  to: DateKey,
  read: () => Promise<T[]>,
): Promise<HealthReadResult<T>> {
  try {
    const blocked = await unavailable();
    if (blocked) return blocked;
    if (from > to) return { status: 'ok', items: [] };
    // Reads never open the access sheet: `requestHealthAccess()` does, once, from a user action.
    const status = await healthStore.checkAuthorization({ read: [kind] });
    if (!status.readAuthorized.includes(kind)) return { status: 'denied', hint: deniedHint() };
    const items = await read();
    return items.length === 0 && getPlatform() === 'ios'
      ? { status: 'ok', items, hint: HEALTH_TEXTS.maybeDeniedIos }
      : { status: 'ok', items };
  } catch (e) {
    if (e instanceof TooMuchHealthData) return { status: 'failed', hint: HEALTH_TEXTS.tooMuch };
    console.error(`read ${kind} from the health store failed`, e);
    return { status: 'failed', hint: HEALTH_TEXTS.failed };
  }
}

const inDays = (day: DateKey, from: DateKey, to: DateKey) => day >= from && day <= to;
/** Noon of a day: sleep windows run noon to noon, so a night is never cut at midnight. */
const noon = (day: DateKey) => atLocalTime(day, '12:00');

/**
 * Nights from Health Connect (Android) / HealthKit (iOS) whose wake-up day is in `from..to` — the day `saveSleep`
 * files a night under. Each night carries `externalId` / `sourceId` (the same night from two apps or read twice is
 * told apart) and `main` (naps are extra entries). Read a week at a time; never rejects. Call
 * `requestHealthAccess()` first; without access the result is `denied`.
 */
export async function readSleep(from: DateKey, to: DateKey): Promise<HealthReadResult<ImportedSleep>> {
  return readHealth('sleep', from, to, async () => {
    const samples = new Map<string, StoreSleepSample>();
    // From noon before the first wake-up day to noon after the last one.
    for (let start = shiftDateKey(from, -1); start <= to; start = shiftDateKey(start, SLEEP_CHUNK_DAYS)) {
      const end = [shiftDateKey(start, SLEEP_CHUNK_DAYS), shiftDateKey(to, 1)].sort()[0];
      const chunk = await healthStore.readSamples({
        dataType: 'sleep',
        startDate: new Date(noon(start)).toISOString(),
        endDate: new Date(noon(end)).toISOString(),
        limit: SLEEP_CHUNK_LIMIT,
        ascending: true,
      });
      if (chunk.samples.length >= SLEEP_CHUNK_LIMIT) throw new TooMuchHealthData();
      // A sample crossing a chunk border comes twice.
      for (const s of chunk.samples) samples.set(s.platformId ?? `${s.sourceId}|${s.startDate}|${s.endDate}`, s);
    }
    return toSleepNights([...samples.values()] as StoreSleepSample[]).filter((n) =>
      inDays(toDateKey(n.wakeTime), from, to),
    );
  });
}

/**
 * Workouts from Health Connect / HealthKit that started on a day in `from..to`, in the app's types (the module adds
 * `rpe` and writes through `saveWorkout`). Each carries `externalId` / `sourceId`. Never rejects; more than about
 * 2000 workouts in the range is `failed` (choose a shorter range). Call `requestHealthAccess()` first.
 */
export async function readWorkouts(from: DateKey, to: DateKey): Promise<HealthReadResult<ImportedWorkout>> {
  return readHealth('workouts', from, to, async () => {
    const workouts = new Map<string, StoreWorkout>();
    let anchor: string | undefined;
    for (let page = 0; ; page++) {
      if (page === MAX_WORKOUT_PAGES) throw new TooMuchHealthData();
      const result = await healthStore.queryWorkouts({
        startDate: fromDateKey(from).toISOString(),
        endDate: fromDateKey(shiftDateKey(to, 1)).toISOString(),
        limit: WORKOUT_PAGE,
        ascending: true,
        ...(anchor && { anchor }),
      });
      // iOS pages overlap: a long workout at a page border comes twice.
      for (const w of result.workouts) workouts.set(w.platformId ?? `${w.sourceId}|${w.startDate}|${w.endDate}`, w);
      anchor = result.anchor ?? undefined;
      if (!anchor) break;
    }
    return toImportedWorkouts([...workouts.values()]).filter((w) => inDays(w.date, from, to));
  });
}
