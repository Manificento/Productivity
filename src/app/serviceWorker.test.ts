import { describe, expect, it, vi } from 'vitest';
import { startServiceWorker } from './serviceWorker';

function fakeContainer(registrations: { unregister: () => Promise<boolean> }[]) {
  return { getRegistrations: vi.fn(() => Promise.resolve(registrations)) };
}

describe('service worker PWA только на вебе', () => {
  it('Given нативная оболочка When приложение стартует Then service worker PWA не регистрируется', async () => {
    const register = vi.fn();
    const old = { unregister: vi.fn(() => Promise.resolve(true)) };
    await startServiceWorker({ native: true, register, container: fakeContainer([old]) });
    expect(register).not.toHaveBeenCalled();
    // A worker left by an earlier build would keep serving a stale bundle: it is removed too.
    expect(old.unregister).toHaveBeenCalledOnce();
  });

  it('Given веб-сборка When приложение стартует Then service worker регистрируется как раньше', async () => {
    const register = vi.fn();
    const container = fakeContainer([]);
    await startServiceWorker({ native: false, register, container });
    expect(register).toHaveBeenCalledOnce();
    expect(container.getRegistrations).not.toHaveBeenCalled();
  });

  it('нативная оболочка без поддержки service worker стартует без ошибки', async () => {
    const register = vi.fn();
    await expect(startServiceWorker({ native: true, register, container: undefined })).resolves.toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });
});
