import { describe, expect, it, vi } from 'vitest';
import { startServiceWorker } from './serviceWorker';

function fakeContainer(registrations: ServiceWorkerRegistration[] = []) {
  return {
    register: vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration)),
    getRegistrations: vi.fn(() => Promise.resolve(registrations)),
  };
}

function fakeCaches(names: string[]) {
  return { keys: vi.fn(() => Promise.resolve(names)), delete: vi.fn(() => Promise.resolve(true)) };
}

describe('service worker PWA только на вебе', () => {
  it('Given нативная оболочка When приложение стартует Then service worker PWA не регистрируется', async () => {
    const old = { unregister: vi.fn(() => Promise.resolve(true)) } as unknown as ServiceWorkerRegistration;
    const container = fakeContainer([old]);
    const caches = fakeCaches(['workbox-precache-v2-https://localhost/', 'lifeos-user-data']);
    await startServiceWorker({ native: true, container, caches });
    expect(container.register).not.toHaveBeenCalled();
    // A worker left by an earlier build would keep serving a stale bundle: it goes, with its precache.
    expect(old.unregister).toHaveBeenCalledOnce();
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith('workbox-precache-v2-https://localhost/');
  });

  it('Given веб-сборка When приложение стартует Then service worker регистрируется как раньше', async () => {
    const container = fakeContainer();
    await startServiceWorker({ native: false, container, caches: fakeCaches([]) });
    expect(container.register).toHaveBeenCalledExactlyOnceWith('./sw.js', { scope: './' });
    expect(container.getRegistrations).not.toHaveBeenCalled();
  });

  it('без поддержки service worker приложение стартует без ошибки', async () => {
    await expect(
      startServiceWorker({ native: true, container: undefined, caches: undefined }),
    ).resolves.toBeUndefined();
    await expect(
      startServiceWorker({ native: false, container: undefined, caches: undefined }),
    ).resolves.toBeUndefined();
  });

  it('нативная оболочка без Cache Storage только снимает воркер', async () => {
    const container = fakeContainer();
    await expect(startServiceWorker({ native: true, container, caches: undefined })).resolves.toBeUndefined();
    expect(container.getRegistrations).toHaveBeenCalledOnce();
  });
});
