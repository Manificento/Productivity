import { vi } from 'vitest';
import {
  CAPABILITY_PLUGINS,
  clearWebReminders,
  setLocalNotificationsBridge,
  setPlatformRuntime,
  setSleepSensorsBridge,
  type Capability,
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

/** Back to the real bridge: in jsdom that is the web, where every capability is `false`. */
export function resetPlatform(): void {
  setPlatformRuntime(null);
  setLocalNotificationsBridge(null);
  setSleepSensorsBridge(null);
  clearWebReminders();
}
