import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportAll } from '../backup';
import { db } from '../db';
import {
  AccountError,
  completeSignIn,
  deleteAccount,
  getAccessToken,
  recordConsent,
  refreshConsents,
  requestSignIn,
  signOut,
  useAccount,
  useConsents,
} from './index';

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all([db.settings.clear(), db.tasks.clear(), db.syncOutbox.clear()]);
});

describe('contract #278: сборка без облачного бэкенда', () => {
  it('Given сборка без VITE_SUPABASE_URL_<REGION> When приложение работает Then useAccount() возвращает состояние unavailable, ни одного сетевого запроса нет, всё работает как раньше', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);

    const account = renderHook(() => useAccount());
    const consents = renderHook(() => useConsents());
    expect(account.result.current).toEqual({ status: 'unavailable' });
    expect(consents.result.current.status).toBe('unavailable');
    expect(consents.result.current.isGranted('cloud')).toBe(false);

    // Every function of the account answers «unavailable» instead of reaching for the network.
    const calls = [
      () => requestSignIn('anna@example.com'),
      () => completeSignIn({ code: '123456' }),
      () => completeSignIn({ linkCode: 'a1b2' }),
      () => getAccessToken(),
      () => recordConsent('cloud', true, '2026-11'),
      () => refreshConsents(),
      () => deleteAccount(),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ name: 'AccountError', kind: 'unavailable' });
    }
    await expect(requestSignIn('anna@example.com')).rejects.toBeInstanceOf(AccountError);
    await expect(signOut()).resolves.toEqual({ revokedOnServer: false });

    // The app works as before: data is written and exported, nothing about an account appears on the device.
    await db.tasks.add({ id: 't1', title: 'Задача', priority: 2, tags: [], createdAt: 1, updatedAt: 1 });
    expect((await exportAll(1)).tables.tasks).toHaveLength(1);
    expect((await db.settings.toArray()).filter((row) => row.key.startsWith('account.'))).toEqual([]);

    await waitFor(() => expect(account.result.current).toEqual({ status: 'unavailable' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('адрес региона без публичного ключа — тоже unavailable', () => {
    vi.stubEnv('VITE_SUPABASE_URL_KZ', 'https://api.kz.example');
    expect(renderHook(() => useAccount()).result.current).toEqual({ status: 'unavailable' });
  });
});
