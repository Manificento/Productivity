interface ServiceWorkerStart {
  /** Running inside the Capacitor shell (`isNativePlatform()` from `src/core/platform.ts`). */
  native: boolean;
  /** `navigator.serviceWorker`; absent where the browser or WebView has no service worker support. */
  container: Pick<ServiceWorkerContainer, 'register' | 'getRegistrations'> | undefined;
  /** `window.caches`, to drop the precache of a removed worker. */
  caches: Pick<CacheStorage, 'keys' | 'delete'> | undefined;
}

/** Same call the plugin's injected `registerSW.js` made — no auto-reload on update. */
const WORKER = { url: './sw.js', scope: './' };

/**
 * The PWA service worker runs on the web only. In the native shell the bundle already ships inside the APK,
 * and a worker would keep serving the previous bundle after an app update (#196) — so none is registered,
 * and one left by an earlier build is removed together with its Workbox precache.
 */
export async function startServiceWorker({ native, container, caches }: ServiceWorkerStart): Promise<void> {
  if (!container) return;
  if (!native) {
    await container.register(WORKER.url, { scope: WORKER.scope });
    return;
  }
  const registrations = await container.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  const names = (await caches?.keys()) ?? [];
  await Promise.all(names.filter((name) => name.startsWith('workbox-precache')).map((name) => caches!.delete(name)));
}
