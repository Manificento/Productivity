import { vi } from 'vitest';
import {
  CAPABILITY_PLUGINS,
  type AlarmBridge,
  type AlarmDismissal,
  clearWebReminders,
  setAlarmBridge,
  setHealthStoreBridge,
  setLocalNotificationsBridge,
  setPlatformRuntime,
  setSleepSensorsBridge,
  type Capability,
  type HealthStoreBridge,
  type LocalNotificationsBridge,
  type SleepSensorsBridge,
} from '../core/platform';
import type { NightSample } from '../core/types';

/**
 * Pretend the app runs in the native shell with the given capabilities' plugins installed.
 * `src/test/setup.ts` restores the real (web) bridge after every test.
 */
export function mockNativePlatform(platform: 'android' | 'ios', capabilities: readonly Capability[] = []): void {
  const plugins = new Set(capabilities.map((capability) => CAPABILITY_PLUGINS[capability]));
  setPlatformRuntime({ getPlatform: () => platform, isPluginAvailable: (name) => plugins.has(name) });
}

type Notifications = Parameters<LocalNotificationsBridge['schedule']>[0]['notifications'];

/** A fake native LocalNotifications plugin that records what was scheduled and cancelled. */
export interface FakeLocalNotifications {
  permission: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
  /** What `requestPermissions()` turns a prompt into. */
  answer: 'granted' | 'denied';
  /** Android «Alarms & reminders» (exact alarms) setting. */
  exactAlarm: 'granted' | 'denied';
  /** When set, `schedule()` rejects with it (e.g. notifications switched off in the system meanwhile). */
  scheduleError?: unknown;
  scheduled: Notifications;
  cancelled: number[];
  bridge: { [K in keyof LocalNotificationsBridge]: ReturnType<typeof vi.fn<LocalNotificationsBridge[K]>> };
}

export function mockLocalNotifications(
  permission: FakeLocalNotifications['permission'] = 'granted',
  answer: FakeLocalNotifications['answer'] = 'granted',
): FakeLocalNotifications {
  const fake = {
    permission,
    answer,
    exactAlarm: 'granted',
    scheduled: [],
    cancelled: [],
  } as unknown as FakeLocalNotifications;
  fake.bridge = {
    checkPermissions: vi.fn(async () => ({ display: fake.permission })),
    requestPermissions: vi.fn(async () => {
      if (fake.permission === 'prompt' || fake.permission === 'prompt-with-rationale') fake.permission = fake.answer;
      return { display: fake.permission };
    }),
    checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: fake.exactAlarm })),
    schedule: vi.fn(async ({ notifications }) => {
      if (fake.scheduleError !== undefined) throw fake.scheduleError;
      for (const n of notifications) fake.scheduled = [...fake.scheduled.filter((s) => s.id !== n.id), n];
      return { notifications: notifications.map((n) => ({ id: n.id })) };
    }),
    cancel: vi.fn(async ({ notifications }) => {
      for (const { id } of notifications) {
        fake.cancelled.push(id);
        fake.scheduled = fake.scheduled.filter((s) => s.id !== id);
      }
    }),
  };
  setLocalNotificationsBridge(fake.bridge);
  return fake;
}

/** A fake night-sensing plugin: `record()` plays the native service writing minute aggregates. */
export interface FakeNightSensors {
  microphone: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
  /** What `requestPermissions()` turns a prompt into. */
  answer: 'granted' | 'denied';
  running: boolean;
  buffer: NightSample[];
  record(...samples: NightSample[]): void;
  bridge: { [K in keyof SleepSensorsBridge]: ReturnType<typeof vi.fn<SleepSensorsBridge[K]>> };
}

export function mockNightSensors(
  microphone: FakeNightSensors['microphone'] = 'granted',
  answer: FakeNightSensors['answer'] = 'granted',
): FakeNightSensors {
  const fake = { microphone, answer, running: false, buffer: [] } as unknown as FakeNightSensors;
  fake.record = (...samples) => {
    if (fake.running) fake.buffer.push(...samples);
  };
  fake.bridge = {
    checkPermissions: vi.fn(async () => ({ microphone: fake.microphone })),
    requestPermissions: vi.fn(async () => {
      if (fake.microphone === 'prompt' || fake.microphone === 'prompt-with-rationale') fake.microphone = fake.answer;
      return { microphone: fake.microphone };
    }),
    start: vi.fn(async () => {
      fake.running = true;
    }),
    stop: vi.fn(async () => {
      fake.running = false;
    }),
    isActive: vi.fn(async () => ({ active: fake.running })),
    getSamples: vi.fn(async () => ({ samples: [...fake.buffer] })),
    clearSamples: vi.fn(async ({ upTo }) => {
      fake.buffer = fake.buffer.filter((s) => s.minuteStart > upTo);
    }),
  };
  setSleepSensorsBridge(fake.bridge);
  return fake;
}

/** A fake native alarm plugin: `dismiss()` plays the user switching off a ringing alarm (app open or closed). */
export interface FakeAlarm {
  notifications: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
  /** What `requestPermissions()` turns a prompt into. */
  answer: 'granted' | 'denied';
  /** Android 12 «Alarms & reminders» (exact alarms); `set()` rejects with `EXACT_DENIED` when off. */
  exactAlarm: 'granted' | 'denied';
  /** When set, `set()` rejects with it. */
  setError?: unknown;
  /** The one alarm the OS holds now. */
  scheduled?: { at: number; windowMin: number };
  /** Dismissals not yet taken by JS (kept by the native side while the app is closed). */
  pending: AlarmDismissal[];
  /** Whether a JS listener is attached to the native `dismissed` event. */
  listening: boolean;
  /** The alarm rang and the user switched it off at `dismissedAt`. */
  dismiss(dismissedAt: number): void;
  bridge: { [K in keyof AlarmBridge]: ReturnType<typeof vi.fn<AlarmBridge[K]>> };
}

export function mockAlarm(
  notifications: FakeAlarm['notifications'] = 'granted',
  answer: FakeAlarm['answer'] = 'granted',
): FakeAlarm {
  const fake = { notifications, answer, exactAlarm: 'granted', pending: [], listening: false } as unknown as FakeAlarm;
  const listeners = new Set<() => void>();
  fake.dismiss = (dismissedAt) => {
    const alarmAt = fake.scheduled?.at ?? dismissedAt;
    fake.scheduled = undefined;
    fake.pending.push({ dismissedAt, alarmAt });
    for (const l of listeners) l();
  };
  fake.bridge = {
    checkPermissions: vi.fn(async () => ({ notifications: fake.notifications })),
    requestPermissions: vi.fn(async () => {
      if (fake.notifications === 'prompt' || fake.notifications === 'prompt-with-rationale')
        fake.notifications = fake.answer;
      return { notifications: fake.notifications };
    }),
    set: vi.fn(async ({ at, windowMin }) => {
      if (fake.setError !== undefined) throw fake.setError;
      if (fake.exactAlarm === 'denied')
        throw Object.assign(new Error('Exact alarms are off'), { code: 'EXACT_DENIED' });
      fake.scheduled = { at, windowMin };
    }),
    cancel: vi.fn(async () => {
      fake.scheduled = undefined;
    }),
    takeDismissals: vi.fn(async () => {
      const dismissals = fake.pending;
      fake.pending = [];
      return { dismissals };
    }),
    addListener: vi.fn(async (_event, listener) => {
      listeners.add(listener);
      fake.listening = true;
      return {
        remove: async () => {
          listeners.delete(listener);
          fake.listening = listeners.size > 0;
        },
      };
    }),
  };
  setAlarmBridge(fake.bridge);
  return fake;
}

type HealthKind = 'sleep' | 'workouts';
type StoreSamples = Awaited<ReturnType<HealthStoreBridge['readSamples']>>['samples'];
type StoreWorkouts = Awaited<ReturnType<HealthStoreBridge['queryWorkouts']>>['workouts'];

/** A fake Health Connect / HealthKit plugin with stored records and the user's answers to the access sheet. */
export interface FakeHealthStore {
  available: boolean;
  /** `AvailabilityResult.reason` when not available. */
  reason?: string;
  /** Kinds the user allowed. */
  granted: HealthKind[];
  /** What the user answers in the access sheet, per kind (missing — deny). */
  answer: Partial<Record<HealthKind, 'allow' | 'deny'>>;
  /**
   * HealthKit: once the sheet was shown, every asked kind reads as authorized whatever the user chose, and reading
   * a refused kind simply returns nothing.
   */
  hidesDenial: boolean;
  sleep: StoreSamples;
  workouts: StoreWorkouts;
  /** Workouts per page (pages are chained with an anchor, as the plugin does). */
  pageSize: number;
  bridge: { [K in keyof HealthStoreBridge]: ReturnType<typeof vi.fn<HealthStoreBridge[K]>> };
}

export function mockHealthStore(
  granted: HealthKind[] = ['sleep', 'workouts'],
  answer: FakeHealthStore['answer'] = { sleep: 'allow', workouts: 'allow' },
): FakeHealthStore {
  const fake = {
    available: true,
    granted: [...granted],
    answer,
    hidesDenial: false,
    sleep: [],
    workouts: [],
    pageSize: 100,
  } as unknown as FakeHealthStore;
  const shown = new Set<HealthKind>();
  const status = (asked: HealthKind[]) => {
    const ok = (k: HealthKind) => fake.granted.includes(k) || (fake.hidesDenial && shown.has(k));
    return {
      readAuthorized: asked.filter(ok),
      readDenied: asked.filter((k) => !ok(k)),
      writeAuthorized: [],
      writeDenied: [],
    };
  };
  const asked = (options: { read?: string[] }) => (options.read ?? []) as HealthKind[];
  const readable = (kind: HealthKind) => fake.granted.includes(kind);
  const overlaps = (r: { startDate: string; endDate: string }, from = '', to = '9') =>
    r.endDate > from && r.startDate < to;
  fake.bridge = {
    isAvailable: vi.fn(async () => ({ available: fake.available, ...(fake.reason && { reason: fake.reason }) })),
    checkAuthorization: vi.fn(async (options) => status(asked(options))),
    requestAuthorization: vi.fn(async (options) => {
      for (const k of asked(options)) {
        shown.add(k);
        if (fake.answer[k] === 'allow' && !fake.granted.includes(k)) fake.granted.push(k);
      }
      return status(asked(options));
    }),
    readSamples: vi.fn(async ({ startDate, endDate, limit = 100 }) => ({
      samples: readable('sleep') ? fake.sleep.filter((s) => overlaps(s, startDate, endDate)).slice(0, limit) : [],
    })),
    queryWorkouts: vi.fn(async ({ startDate, endDate, anchor }) => {
      const inRange = readable('workouts') ? fake.workouts.filter((w) => overlaps(w, startDate, endDate)) : [];
      const from = anchor ? Number(anchor) : 0;
      const next = from + fake.pageSize;
      return { workouts: inRange.slice(from, next), ...(next < inRange.length && { anchor: String(next) }) };
    }),
    openHealthConnectSettings: vi.fn(async () => {}),
  };
  setHealthStoreBridge(fake.bridge);
  return fake;
}

/** Back to the real bridge: in jsdom that is the web, where every capability is `false`. */
export function resetPlatform(): void {
  setPlatformRuntime(null);
  setLocalNotificationsBridge(null);
  setSleepSensorsBridge(null);
  setHealthStoreBridge(null);
  setAlarmBridge(null);
  clearWebReminders();
}
