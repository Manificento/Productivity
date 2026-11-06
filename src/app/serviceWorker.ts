interface ServiceWorkerStart {
  /** Running inside the Capacitor shell (`isNativePlatform()` from `src/core/platform.ts`). */
  native: boolean;
  /** Registers the PWA worker (`registerSW` from `virtual:pwa-register`). */
  register: () => void;
  /** `navigator.serviceWorker`; absent where the WebView has no service worker support. */
  container: { getRegistrations(): Promise<readonly Pick<ServiceWorkerRegistration, 'unregister'>[]> } | undefined;
}

/**
 * The PWA service worker runs on the web only. In the native shell the bundle already ships inside the APK,
 * and a worker would keep serving the previous bundle after an app update (#196) — so none is registered,
 * and one left by an earlier build is removed.
 */
export async function startServiceWorker({ native, register, container }: ServiceWorkerStart): Promise<void> {
  if (!native) {
    register();
    return;
  }
  const registrations = (await container?.getRegistrations()) ?? [];
  await Promise.all(registrations.map((registration) => registration.unregister()));
}
