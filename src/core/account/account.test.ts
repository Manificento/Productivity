import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../../package.json';
import { FakeAccountServer } from '../../test/fakeAccountServer';
import { exportAll, importAll } from '../backup';
import { db } from '../db';
import { backendFor } from '../sync/config';
import { isLocalOnlySetting } from '../sync/localOnly';
import {
  AccountError,
  completeSignIn,
  deleteAccount,
  getAccessToken,
  requestSignIn,
  signInCodeFromUrl,
  signOut,
  useAccount,
} from './index';

const NOW = new Date('2026-11-16T09:00:00+05:00').getTime();
const HOUR = 3600_000;
const ANNA = 'anna@example.com';

let server: FakeAccountServer;

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL_KZ', 'https://api.kz.example/');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY_KZ', 'anon-kz');
  server = new FakeAccountServer('https://api.kz.example');
  server.now = () => NOW;
  vi.stubGlobal('fetch', vi.fn(server.fetch));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all([db.settings.clear(), db.tasks.clear(), db.syncOutbox.clear()]);
});

/** Signs Anna in with the code of the letter; the session is on the device afterwards. */
async function signIn(now = NOW): Promise<void> {
  await requestSignIn(ANNA, { now });
  await completeSignIn({ code: server.letterTo(ANNA).code }, now);
}

const storedSession = async () => (await db.settings.get('account.session'))?.value as Record<string, unknown>;
const paths = () => server.requests.map((request) => `${request.method} ${request.path}`);
const addTask = () => db.tasks.add({ id: 't1', title: 'Задача', priority: 2, tags: [], createdAt: 1, updatedAt: 1 });

describe('contract #278: вход по email', () => {
  it('Given бэкенд региона настроен When вызываю requestSignIn(email) Then сервер Auth шлёт одно письмо со ссылкой и шестизначным кодом; completeSignIn принимает и код, и параметр ?code= из ссылки (до #, совместимо с HashRouter); сторонний SDK не добавляется — тонкий fetch к /auth/v1 региона из backendFor()', async () => {
    const account = renderHook(() => useAccount());
    await waitFor(() => expect(account.result.current).toEqual({ status: 'signedOut' }));

    // One request for one letter, to the Auth of the region the build is configured for.
    await requestSignIn(` ${ANNA} `, { now: NOW });
    expect(server.requests).toHaveLength(1);
    const [asked] = server.requests;
    expect(`${backendFor('kz')?.url}${asked.path}`).toBe('https://api.kz.example/auth/v1/otp');
    expect(asked.method).toBe('POST');
    expect(asked.headers).toMatchObject({ apikey: 'anon-kz', authorization: 'Bearer anon-kz' });
    expect(asked.body).toEqual({
      email: ANNA,
      create_user: true,
      code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      code_challenge_method: 's256',
    });
    expect(server.letters).toHaveLength(1);
    expect(server.letterTo(ANNA).code).toMatch(/^\d{6}$/);
    await waitFor(() => expect(account.result.current).toEqual({ status: 'pending', email: ANNA, region: 'kz' }));

    // The six digits, typed in the app (the native shell has no other way).
    await completeSignIn({ code: ` ${server.letterTo(ANNA).code} ` }, NOW);
    expect(server.requests[1]).toMatchObject({
      method: 'POST',
      path: '/auth/v1/verify',
      body: { type: 'email', email: ANNA, token: server.letterTo(ANNA).code },
    });
    await waitFor(() =>
      expect(account.result.current).toEqual({ status: 'signedIn', email: ANNA, userId: 'user-1', region: 'kz' }),
    );
    // The hook gives no tokens away.
    expect(JSON.stringify(account.result.current)).not.toContain('token');

    // The link of the letter: `?code=` stands before `#`, where HashRouter keeps the route.
    await signOut(NOW);
    await requestSignIn(ANNA, { now: NOW, redirectTo: 'https://app.example/' });
    expect(server.requests.at(-1)?.path).toBe('/auth/v1/otp?redirect_to=https%3A%2F%2Fapp.example%2F');
    const link = `https://app.example/?code=${server.letterTo(ANNA).linkCode}#/settings/account`;
    const linkCode = signInCodeFromUrl(link);
    expect(linkCode).toBe(server.letterTo(ANNA).linkCode);
    await completeSignIn({ linkCode: linkCode ?? '' }, NOW);
    expect(server.requests.at(-2)).toMatchObject({
      method: 'POST',
      path: '/auth/v1/token?grant_type=pkce',
      body: { auth_code: linkCode, code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) },
    });
    await waitFor(() => expect(account.result.current.status).toBe('signedIn'));

    // A thin fetch and nothing else: every request went to the region's own gateway, and no SDK is installed.
    expect(
      vi.mocked(globalThis.fetch).mock.calls.every(([url]) => String(url).startsWith('https://api.kz.example/')),
    ).toBe(true);
    expect(new Set(paths().map((path) => path.replace(/\?.*/, '')))).toEqual(
      new Set([
        'POST /auth/v1/otp',
        'POST /auth/v1/verify',
        'POST /auth/v1/token',
        'POST /auth/v1/logout',
        'GET /rest/v1/consents',
      ]),
    );
    const installed = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
    expect(installed.filter((name) => /supabase|gotrue|auth0|firebase|oauth|passport/i.test(name))).toEqual([]);
  });

  it('signInCodeFromUrl читает code только из запроса адреса — не из маршрута после #', () => {
    expect(signInCodeFromUrl('https://app.example/?code=abc-123#/today')).toBe('abc-123');
    expect(signInCodeFromUrl('https://app.example/sub/path/?x=1&code=abc')).toBe('abc');
    expect(signInCodeFromUrl('https://app.example/#/settings?code=abc')).toBeNull();
    expect(signInCodeFromUrl('https://app.example/?code=')).toBeNull();
    expect(signInCodeFromUrl('не адрес')).toBeNull();
  });

  it('ссылка, открытая на устройстве, которое письмо не запрашивало, никого не впускает', async () => {
    await requestSignIn(ANNA, { now: NOW });
    const { linkCode } = server.letterTo(ANNA);
    // Another device: no pending sign-in, so no verifier to prove the link with.
    await db.settings.clear();
    await expect(completeSignIn({ linkCode }, NOW)).rejects.toMatchObject({ kind: 'no_pending_sign_in' });
    await expect(completeSignIn({ code: '123456' }, NOW)).rejects.toMatchObject({ kind: 'no_pending_sign_in' });
    // …and a device that asked for its own letter cannot use somebody else's link either.
    await requestSignIn('boris@example.com', { now: NOW });
    await expect(completeSignIn({ linkCode }, NOW)).rejects.toMatchObject({ kind: 'invalid_code', status: 400 });
    expect(await storedSession()).toMatchObject({ state: 'pending', email: 'boris@example.com' });
  });

  it('неверный или использованный код: вход не выполнен, можно ввести код ещё раз', async () => {
    await requestSignIn(ANNA, { now: NOW });
    await expect(completeSignIn({ code: '000000' }, NOW)).rejects.toMatchObject({ kind: 'invalid_code', status: 403 });
    expect(await storedSession()).toMatchObject({ state: 'pending', email: ANNA });
    await completeSignIn({ code: server.letterTo(ANNA).code }, NOW);
    expect(await storedSession()).toMatchObject({ state: 'signedIn', email: ANNA });
  });

  it('адрес без @ не уходит на сервер; отказ сервера и потерянная связь — понятные ошибки, состояние не меняется', async () => {
    await expect(requestSignIn('anna', { now: NOW })).rejects.toMatchObject({ kind: 'invalid_email' });
    expect(server.requests).toHaveLength(0);
    await expect(requestSignIn('anna@nowhere', { now: NOW })).rejects.toMatchObject({
      kind: 'invalid_email',
      status: 400,
    });
    server.offline = true;
    await expect(requestSignIn(ANNA, { now: NOW })).rejects.toMatchObject({ kind: 'network', status: undefined });
    expect(await db.settings.get('account.session')).toBeUndefined();
  });

  it('ответы сервера Auth: слишком частые письма, закрытая регистрация, сбой сервера', async () => {
    const answer = (status: number, body: unknown) =>
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
    answer(429, { error_code: 'over_email_send_rate_limit' });
    await expect(requestSignIn(ANNA)).rejects.toMatchObject({ kind: 'rate_limited', status: 429 });
    answer(422, { error_code: 'otp_disabled' });
    await expect(requestSignIn(ANNA)).rejects.toMatchObject({ kind: 'sign_up_closed' });
    answer(503, 'Service Unavailable');
    await expect(requestSignIn(ANNA)).rejects.toMatchObject({ kind: 'server', status: 503 });
    // An answer that is not a session is not taken for one.
    await requestSignIn(ANNA, { now: NOW });
    answer(200, { access_token: 'only-half-of-a-session' });
    await expect(completeSignIn({ code: '123456' }, NOW)).rejects.toMatchObject({ kind: 'server' });
    expect(await storedSession()).toMatchObject({ state: 'pending' });
  });

  it('без Web Crypto (не HTTPS) проверочная строка уходит как plain — ссылка всё равно работает', async () => {
    const subtle = vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);
    await requestSignIn(ANNA, { now: NOW });
    subtle.mockRestore();
    expect(server.letterTo(ANNA).method).toBe('plain');
    await completeSignIn({ linkCode: server.letterTo(ANNA).linkCode }, NOW);
    expect(await storedSession()).toMatchObject({ state: 'signedIn' });
  });
});

describe('contract #278: сессия', () => {
  it('Given вход выполнен When приложение перезапущено или токен истёк Then сессия восстановлена из settings (ключ account.session — состояние устройства: в localOnly, не в экспорте, не в синхронизации), токен обновляется; signOut() стирает сессию на устройстве и отзывает её на сервере; локальные данные не трогаются', async () => {
    await addTask();
    await signIn();
    const session = await storedSession();
    expect(session).toEqual({
      state: 'signedIn',
      region: 'kz',
      userId: 'user-1',
      email: ANNA,
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
      expiresAt: NOW + HOUR,
    });

    // Device state: listed as local-only, never queued for the sync, never in a backup — and kept by an import.
    expect(isLocalOnlySetting('account.session')).toBe(true);
    expect((await db.syncOutbox.toArray()).map((entry) => entry.key)).toEqual(['t1']);
    const backup = await exportAll(NOW);
    expect(backup.tables.settings).toEqual([]);
    expect(JSON.stringify(backup)).not.toMatch(/access-token|refresh-token|account\./);
    const foreign = structuredClone(backup);
    foreign.tables.settings.push({ key: 'account.session', value: { ...session, userId: 'somebody-else' } });
    await importAll(foreign);
    expect(await storedSession()).toEqual(session);

    // «Restart»: nothing but the database survives; the session is read from it, without the network.
    const before = server.requests.length;
    const restarted = renderHook(() => useAccount());
    await waitFor(() =>
      expect(restarted.result.current).toEqual({ status: 'signedIn', email: ANNA, userId: 'user-1', region: 'kz' }),
    );
    expect(await getAccessToken(NOW + 10 * 60_000)).toBe('access-token-1');
    expect(server.requests).toHaveLength(before);

    // The token has expired: it is refreshed once, however many requests wait for it, and the new one is stored.
    const later = NOW + HOUR + 1;
    const tokens = await Promise.all([getAccessToken(later), getAccessToken(later), getAccessToken(later)]);
    expect(tokens).toEqual(['access-token-2', 'access-token-2', 'access-token-2']);
    expect(server.requests.slice(before)).toMatchObject([
      { method: 'POST', path: '/auth/v1/token?grant_type=refresh_token', body: { refresh_token: 'refresh-token-1' } },
    ]);
    expect(await storedSession()).toMatchObject({
      accessToken: 'access-token-2',
      refreshToken: 'refresh-token-2',
      expiresAt: later + HOUR,
    });
    // A token about to expire is refreshed too — a request never leaves with one that dies on the way.
    expect(await getAccessToken(later + HOUR - 30_000)).toBe('access-token-3');

    // Sign-out: revoked on the server (this session only), erased here; the user's data stays.
    expect(await signOut(later + HOUR)).toEqual({ revokedOnServer: true });
    expect(server.requests.at(-1)).toMatchObject({
      method: 'POST',
      path: '/auth/v1/logout?scope=local',
      headers: { authorization: 'Bearer access-token-3' },
    });
    expect(server.hasSession('refresh-token-3')).toBe(false);
    expect(await db.settings.toArray()).toEqual([]);
    await waitFor(() => expect(restarted.result.current).toEqual({ status: 'signedOut' }));
    expect(await db.tasks.get('t1')).toMatchObject({ title: 'Задача' });
    expect((await db.syncOutbox.toArray()).map((entry) => entry.key)).toEqual(['t1']);
    await expect(getAccessToken(later + HOUR)).rejects.toMatchObject({ kind: 'signed_out' });
  });

  it('сервер больше не знает сессию: она стирается на устройстве, данные остаются', async () => {
    await addTask();
    await signIn();
    await db.settings.put({ key: 'account.consents', value: { userId: 'user-1', consents: {} } });
    const { refreshToken } = (await storedSession()) as { refreshToken: string };
    // Revoked elsewhere (the account was deleted on another device, the refresh token is gone).
    await server.fetch('https://api.kz.example/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token-1' },
    });
    expect(server.hasSession(refreshToken)).toBe(false);
    await expect(getAccessToken(NOW + 2 * HOUR)).rejects.toMatchObject({ kind: 'session_expired', status: 400 });
    expect(await db.settings.toArray()).toEqual([]);
    expect(await db.tasks.count()).toBe(1);
  });

  it('нет связи при обновлении токена: ошибка network, сессия остаётся — следующий запрос попробует снова', async () => {
    await signIn();
    server.offline = true;
    await expect(getAccessToken(NOW + 2 * HOUR)).rejects.toMatchObject({ kind: 'network' });
    expect(await storedSession()).toMatchObject({ state: 'signedIn', refreshToken: 'refresh-token-1' });
    server.offline = false;
    expect(await getAccessToken(NOW + 2 * HOUR)).toBe('access-token-2');
  });

  it('выход без связи: сессия на устройстве стёрта, revokedOnServer: false', async () => {
    await signIn();
    server.offline = true;
    expect(await signOut(NOW)).toEqual({ revokedOnServer: false });
    expect(await db.settings.toArray()).toEqual([]);
    expect(server.hasSession('refresh-token-1')).toBe(true);
  });

  it('выход, когда сессии на сервере уже нет, — тоже выход; незавершённый вход просто забывается', async () => {
    await signIn();
    await server.fetch('https://api.kz.example/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token-1' },
    });
    expect(await signOut(NOW + 2 * HOUR)).toEqual({ revokedOnServer: true });
    await requestSignIn(ANNA, { now: NOW });
    const before = server.requests.length;
    expect(await signOut(NOW)).toEqual({ revokedOnServer: false });
    expect(server.requests).toHaveLength(before);
    expect(await db.settings.toArray()).toEqual([]);
  });

  it('новый вход при действующей сессии сначала завершает её на сервере', async () => {
    await signIn();
    await requestSignIn('boris@example.com', { now: NOW });
    expect(server.hasSession('refresh-token-1')).toBe(false);
    expect(await storedSession()).toMatchObject({ state: 'pending', email: 'boris@example.com' });
  });

  it('сессия региона, которого нет в этой сборке, и испорченная запись — не сессия', async () => {
    await signIn();
    const session = await storedSession();
    await db.settings.put({ key: 'account.session', value: { ...session, region: 'eu' } });
    const account = renderHook(() => useAccount());
    await waitFor(() => expect(account.result.current).toEqual({ status: 'unavailable' }));
    await expect(getAccessToken(NOW)).rejects.toMatchObject({ kind: 'unavailable' });

    await db.settings.put({ key: 'account.session', value: { ...session, accessToken: 42 } });
    await waitFor(() => expect(account.result.current).toEqual({ status: 'signedOut' }));
    await expect(getAccessToken(NOW)).rejects.toMatchObject({ kind: 'signed_out' });
  });

  it('токены не попадают ни в журнал, ни в текст ошибок', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    await signIn();
    await getAccessToken(NOW + 2 * HOUR);
    server.offline = true;
    const offline = await getAccessToken(NOW + 4 * HOUR).catch((error: unknown) => error);
    server.offline = false;
    await server.fetch('https://api.kz.example/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token-2' },
    });
    const expired = await getAccessToken(NOW + 4 * HOUR).catch((error: unknown) => error);
    for (const error of [offline, expired]) {
      expect(error).toBeInstanceOf(AccountError);
      expect(JSON.stringify([String(error), error])).not.toMatch(/access-token|refresh-token|[A-Za-z0-9_-]{43}/);
    }
    expect(logs.flatMap((log) => log.mock.calls)).toEqual([]);
  });
});

describe('contract #278: удаление аккаунта (клиент)', () => {
  it('deleteAccount() вызывает delete_account() на сервере и стирает сессию на устройстве; локальные данные остаются', async () => {
    await addTask();
    await signIn();
    await deleteAccount(NOW);
    expect(server.requests.at(-1)).toMatchObject({
      method: 'POST',
      path: '/rest/v1/rpc/delete_account',
      headers: { apikey: 'anon-kz', authorization: 'Bearer access-token-1' },
    });
    expect(server.hasUser(ANNA)).toBe(false);
    expect(await db.settings.toArray()).toEqual([]);
    expect(await db.tasks.get('t1')).toMatchObject({ title: 'Задача' });
    const account = renderHook(() => useAccount());
    await waitFor(() => expect(account.result.current).toEqual({ status: 'signedOut' }));
  });

  it('сервер не ответил или отказал: аккаунт и сессия на месте, можно повторить', async () => {
    await signIn();
    server.offline = true;
    await expect(deleteAccount(NOW)).rejects.toMatchObject({ kind: 'network' });
    server.offline = false;
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('{"code":"XX000"}', { status: 500 }));
    await expect(deleteAccount(NOW)).rejects.toMatchObject({ kind: 'server', status: 500 });
    expect(await storedSession()).toMatchObject({ state: 'signedIn' });
    expect(server.hasUser(ANNA)).toBe(true);
    await deleteAccount(NOW);
    expect(server.hasUser(ANNA)).toBe(false);
  });
});
