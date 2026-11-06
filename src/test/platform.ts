import {
  CAPABILITY_PLUGINS,
  setLocalNotificationsBridge,
  setPlatformRuntime,
  type Capability,
  type LocalNotificationsBridge,
} from '../core/platform';

/**
 * Pretend the app runs in the native shell with the given capabilities' plugins installed.
 * `src/test/setup.ts` restores the real (web) bridge after every test.
 */
export function mockNativePlatform(platform: 'android' | 'ios', capabilities: readonly Capability[] = []): void {
  const plugins = new Set(capabilities.map((capability) => CAPABILITY_PLUGINS[capability]));
  setPlatformRuntime({ getPlatform: () => platform, isPluginAvailable: (name) => plugins.has(name) });
}

/** A fake native LocalNotifications plugin that records what was scheduled and cancelled. */
export interface FakeLocalNotifications extends LocalNotificationsBridge {
  permission: 'granted' | 'denied' | 'prompt';
  /** What `requestPermissions()` turns a `prompt` into. */
  answer: 'granted' | 'denied';
  scheduled: Parameters<LocalNotificationsBridge['schedule']>[0]['notifications'];
  cancelled: number[];
}

export function mockLocalNotifications(
  permission: FakeLocalNotifications['permission'] = 'granted',
  answer: FakeLocalNotifications['answer'] = 'granted',
): FakeLocalNotifications {
  const fake: FakeLocalNotifications = {
    permission,
    answer,
    scheduled: [],
    cancelled: [],
    checkPermissions: async () => ({ display: fake.permission }),
    requestPermissions: async () => {
      if (fake.permission === 'prompt') fake.permission = fake.answer;
      return { display: fake.permission };
    },
    schedule: async ({ notifications }) => {
      for (const n of notifications) {
        fake.scheduled = [...fake.scheduled.filter((s) => s.id !== n.id), n];
      }
      return { notifications: notifications.map((n) => ({ id: n.id })) };
    },
    cancel: async ({ notifications }) => {
      for (const { id } of notifications) {
        fake.cancelled.push(id);
        fake.scheduled = fake.scheduled.filter((s) => s.id !== id);
      }
    },
  };
  setLocalNotificationsBridge(fake);
  return fake;
}

/** Back to the real bridge: in jsdom that is the web, where every capability is `false`. */
export function resetPlatform(): void {
  setPlatformRuntime(null);
  setLocalNotificationsBridge(null);
}
