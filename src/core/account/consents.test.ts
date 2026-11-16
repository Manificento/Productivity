import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAccountServer } from '../../test/fakeAccountServer';
import { exportAll } from '../backup';
import { db } from '../db';
import { isLocalOnlySetting } from '../sync/localOnly';
import { consentsAfterAnswer, type Consent } from './consents';
import {
  AGE_RULES,
  completeSignIn,
  CONSENT_KINDS,
  deleteAccount,
  effectiveConsents,
  isGranted,
  recordConsent,
  refreshConsents,
  requestSignIn,
  signOut,
  useConsents,
} from './index';

const NOW = new Date('2026-11-16T09:00:00+05:00').getTime();
const ANNA = 'anna@example.com';
const TEXT = '2026-11';

let server: FakeAccountServer;

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL_KZ', 'https://api.kz.example');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY_KZ', 'anon-kz');
  server = new FakeAccountServer('https://api.kz.example');
  server.now = () => NOW;
  vi.stubGlobal('fetch', vi.fn(server.fetch));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all([db.settings.clear(), db.tasks.clear(), db.syncOutbox.clear()]);
});

async function signIn(email = ANNA): Promise<void> {
  await requestSignIn(email, { now: NOW });
  await completeSignIn({ code: server.letterTo(email).code }, NOW);
}

const consentRequests = () =>
  server.requests.filter((request) => request.path.startsWith('/rest/v1/consents')).map((request) => request.method);

describe('contract #278: согласия', () => {
  it('Given клиент When вызываю recordConsent(kind, granted, textVersion) и useConsents() Then действующее согласие — последняя строка журнала этого вида; состояние кэшируется на устройстве (ключ устройства) и читается офлайн; отзыв — новая строка granted: false', async () => {
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.status).toBe('signedOut'));
    await signIn();
    // Signed in, and the (empty) journal has been read from the server.
    await waitFor(() => expect(consents.result.current.status).toBe('ready'));
    expect(consents.result.current.consents).toEqual({});
    expect(CONSENT_KINDS.map((kind) => consents.result.current.isGranted(kind))).toEqual(Array(5).fill(false));

    const age = await recordConsent('age', true, TEXT, { rule: 'kz18+' }, NOW);
    expect(age).toEqual({
      id: 1,
      kind: 'age',
      granted: true,
      textVersion: TEXT,
      details: { rule: 'kz18+' },
      createdAt: new Date(NOW).toISOString(),
    });
    // What goes to the server: the four fields of a row — no user, no time, no year of birth.
    expect(server.requests.at(-1)).toMatchObject({
      method: 'POST',
      path: '/rest/v1/consents?select=id,kind,granted,text_version,details,created_at',
      headers: { apikey: 'anon-kz', authorization: 'Bearer access-token-1', prefer: 'return=representation' },
      body: { kind: 'age', granted: true, text_version: TEXT, details: { rule: 'kz18+' } },
    });
    await recordConsent('cloud', true, TEXT, undefined, NOW);
    await recordConsent('cloud_health', true, TEXT, undefined, NOW);
    await waitFor(() => expect(consents.result.current.isGranted('cloud_health')).toBe(true));
    expect(consents.result.current.isGranted('cloud')).toBe(true);
    expect(consents.result.current.isGranted('analytics')).toBe(false);

    // Taking a consent back is a NEW row; the one in force is the last row of its kind.
    server.now = () => NOW + 60_000;
    const revoked = await recordConsent('cloud_health', false, '2026-12', undefined, NOW);
    expect(revoked).toMatchObject({ granted: false, textVersion: '2026-12' });
    expect(server.journalOf(ANNA)).toEqual([
      ['age', true],
      ['cloud', true],
      ['cloud_health', true],
      ['cloud_health', false],
    ]);
    await waitFor(() => expect(consents.result.current.isGranted('cloud_health')).toBe(false));
    expect(consents.result.current.consents.cloud_health).toEqual({
      id: 4,
      kind: 'cloud_health',
      granted: false,
      textVersion: '2026-12',
      details: null,
      createdAt: new Date(NOW + 60_000).toISOString(),
    });
    expect(consents.result.current.isGranted('cloud')).toBe(true);

    // The state lives on the device under a device key: not synced, not in a backup…
    expect(isLocalOnlySetting('account.consents')).toBe(true);
    expect(await db.syncOutbox.count()).toBe(0);
    expect(JSON.stringify(await exportAll(NOW))).not.toContain('account.consents');
    // …and is read offline: a fresh hook («the app was restarted») asks no network.
    server.offline = true;
    const before = server.requests.length;
    const offline = renderHook(() => useConsents());
    await waitFor(() => expect(offline.result.current.status).toBe('ready'));
    expect(offline.result.current.isGranted('cloud')).toBe(true);
    expect(offline.result.current.isGranted('age')).toBe(true);
    expect(offline.result.current.isGranted('cloud_health')).toBe(false);
    expect(server.requests).toHaveLength(before);
    // A consent cannot be given or taken back offline: it counts from the moment the server stored it.
    await expect(recordConsent('cloud', false, TEXT, undefined, NOW)).rejects.toMatchObject({ kind: 'network' });
    expect(offline.result.current.isGranted('cloud')).toBe(true);
  });

  it('effectiveConsents: из строк журнала — последняя строка каждого вида, в каком бы порядке они ни пришли', () => {
    const row = (id: number, kind: (typeof CONSENT_KINDS)[number], granted: boolean) => ({
      id,
      kind,
      granted,
      text_version: `v${id}`,
      details: kind === 'age' ? { rule: AGE_RULES[0] } : null,
      created_at: '2026-11-16T04:00:00+00:00',
    });
    const effective = effectiveConsents([
      row(5, 'cloud', false),
      row(2, 'cloud', true),
      row(1, 'age', true),
      row(7, 'cloud', true),
      row(4, 'analytics', false),
    ]);
    expect(effective).toEqual({
      age: {
        id: 1,
        kind: 'age',
        granted: true,
        textVersion: 'v1',
        details: { rule: '16+' },
        createdAt: '2026-11-16T04:00:00+00:00',
      },
      cloud: {
        id: 7,
        kind: 'cloud',
        granted: true,
        textVersion: 'v7',
        details: null,
        createdAt: '2026-11-16T04:00:00+00:00',
      },
      analytics: expect.objectContaining({ granted: false, textVersion: 'v4' }),
    });
    expect(isGranted(effective, 'cloud')).toBe(true);
    expect(isGranted(effective, 'analytics')).toBe(false);
    expect(isGranted(effective, 'third_party')).toBe(false);
    expect(effectiveConsents([])).toEqual({});
  });

  it('согласия, данные на другом устройстве, приходят при входе и по refreshConsents()', async () => {
    await signIn();
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    await recordConsent('cloud', true, TEXT, undefined, NOW);
    await signOut(NOW);
    expect(await db.settings.get('account.consents')).toBeUndefined();

    // «Another device»: nothing on it but the sign-in.
    await signIn();
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.status).toBe('ready'));
    expect(consents.result.current.isGranted('cloud')).toBe(true);

    // Taken back elsewhere: the copy here learns it from the server.
    const elsewhere = await server.fetch('https://api.kz.example/rest/v1/consents', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token-2' },
      body: JSON.stringify({ kind: 'cloud', granted: false, text_version: TEXT }),
    });
    expect(elsewhere.status).toBe(201);
    expect(consents.result.current.isGranted('cloud')).toBe(true);
    expect(isGranted(await refreshConsents(NOW), 'cloud')).toBe(false);
    await waitFor(() => expect(consents.result.current.isGranted('cloud')).toBe(false));
  });

  it('ответ сервера, прочитавшего журнал ДО нового согласия, приходит после него: копия на устройстве не теряет новую строку — отзыв остаётся отзывом', async () => {
    await signIn();
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    await recordConsent('cloud', true, TEXT, undefined, NOW);
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.isGranted('cloud')).toBe(true));

    // A refresh (another tab, the sign-in) whose GET the server answered before the withdrawal below — and whose
    // answer reaches the device only after it.
    const real = server.fetch;
    let deliver = (): void => undefined;
    const delivered = new Promise<void>((resolve) => (deliver = resolve));
    vi.mocked(globalThis.fetch).mockImplementationOnce(async (input, init) => {
      const old = await real(input, init);
      await delivered;
      return old;
    });
    const refreshing = refreshConsents(NOW);
    await waitFor(() => expect(consentRequests().at(-1)).toBe('GET'));

    const revoked = await recordConsent('cloud', false, TEXT, undefined, NOW);
    expect(revoked).toMatchObject({ id: 3, granted: false });
    deliver();
    // The old answer still says «granted» (row 2); the journal's last row of the kind is the withdrawal (row 3).
    expect((await refreshing).cloud).toMatchObject({ id: 3, granted: false });
    expect(consents.result.current.isGranted('cloud')).toBe(false);
    expect((await db.settings.get('account.consents'))?.value).toMatchObject({
      consents: { age: { id: 1, granted: true }, cloud: { id: 3, granted: false } },
    });
    // The next answer is the whole journal again: nothing was lost and nothing is stuck.
    expect(await refreshConsents(NOW)).toMatchObject({ age: { id: 1 }, cloud: { id: 3, granted: false } });
  });

  it('копия на устройстве опережает журнал (сервер восстановлен из резервной копии): новое согласие не теряется — копия сверяется с журналом', async () => {
    await signIn();
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    // The device remembers a row of the journal that the server no longer has.
    const cached = await db.settings.get('account.consents');
    const value = cached?.value as { userId: string; consents: Record<string, unknown> };
    const lost = { id: 50, kind: 'cloud', granted: true, textVersion: TEXT, details: null, createdAt: '' };
    await db.settings.put({
      key: 'account.consents',
      value: { ...value, consents: { ...value.consents, cloud: lost } },
    });
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.isGranted('cloud')).toBe(true));

    await expect(recordConsent('cloud', false, TEXT, undefined, NOW)).resolves.toMatchObject({ id: 2, granted: false });
    await waitFor(() => expect(consents.result.current.isGranted('cloud')).toBe(false));
    expect(consents.result.current.consents).toMatchObject({ age: { id: 1 }, cloud: { id: 2, granted: false } });

    // Without the network the consent is stored all the same; the copy catches up at the next refresh.
    await db.settings.put({
      key: 'account.consents',
      value: { ...value, consents: { ...value.consents, cloud: lost } },
    });
    const real = server.fetch;
    vi.mocked(globalThis.fetch).mockImplementation((input, init) =>
      init?.method === 'GET' ? Promise.reject(new TypeError('Failed to fetch')) : real(input, init),
    );
    await expect(recordConsent('cloud', true, TEXT, undefined, NOW)).resolves.toMatchObject({ id: 3, granted: true });
    vi.mocked(globalThis.fetch).mockImplementation(real);
    expect(await refreshConsents(NOW)).toMatchObject({ cloud: { id: 3, granted: true } });
  });

  it('копия опережает журнал, а журнал прочитать не удалось: отзыв, который сервер сохранил, всё равно записан в копию — согласие не остаётся разрешённым', async () => {
    await signIn();
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    const cached = await db.settings.get('account.consents');
    const value = cached?.value as { userId: string; consents: Record<string, unknown> };
    const lost = { id: 50, kind: 'cloud', granted: true, textVersion: TEXT, details: null, createdAt: '' };
    await db.settings.put({
      key: 'account.consents',
      value: { ...value, consents: { ...value.consents, cloud: lost } },
    });
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.isGranted('cloud')).toBe(true));

    // The server stores the withdrawal, but the journal cannot be read afterwards.
    const real = server.fetch;
    vi.mocked(globalThis.fetch).mockImplementation((input, init) =>
      init?.method === 'GET' ? Promise.reject(new TypeError('Failed to fetch')) : real(input, init),
    );
    await expect(recordConsent('cloud', false, TEXT, undefined, NOW)).resolves.toMatchObject({ id: 2, granted: false });
    expect(server.journalOf(ANNA)).toEqual([
      ['age', true],
      ['cloud', false],
    ]);
    // Until #279 the device is the only check of the cloud consent: what the user took back is not «granted» here.
    expect((await db.settings.get('account.consents'))?.value).toMatchObject({
      consents: { age: { id: 1, granted: true }, cloud: { id: 2, granted: false } },
    });
    await waitFor(() => expect(consents.result.current.isGranted('cloud')).toBe(false));
    expect(consents.result.current.isGranted('age')).toBe(true);
    // The network is back: the journal says the same.
    vi.mocked(globalThis.fetch).mockImplementation(real);
    expect(await refreshConsents(NOW)).toMatchObject({ cloud: { id: 2, granted: false } });
  });

  it('ответ сервера пришёл после выхода из аккаунта: копия согласий на устройство не возвращается', async () => {
    await signIn();
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    const real = server.fetch;
    const late = (method: string) => {
      let deliver = (): void => undefined;
      const delivered = new Promise<void>((resolve) => (deliver = resolve));
      vi.mocked(globalThis.fetch).mockImplementationOnce(async (input, init) => {
        const answer = await real(input, init);
        await delivered;
        return answer;
      });
      return { deliver, sent: () => waitFor(() => expect(consentRequests().at(-1)).toBe(method)) };
    };

    // The journal was asked for, the user signed out, the answer came.
    const read = late('GET');
    const refreshing = refreshConsents(NOW);
    await read.sent();
    await signOut(NOW);
    read.deliver();
    await expect(refreshing).resolves.toMatchObject({ age: { granted: true } });
    expect(await db.settings.get('account.consents')).toBeUndefined();

    // The same with a consent whose row the server stored while the user was signing out.
    await signIn();
    const written = late('POST');
    const recording = recordConsent('cloud', true, TEXT, undefined, NOW);
    await written.sent();
    await signOut(NOW);
    written.deliver();
    await expect(recording).resolves.toMatchObject({ kind: 'cloud', granted: true });
    expect(await db.settings.get('account.consents')).toBeUndefined();
    expect(await db.settings.get('account.session')).toBeUndefined();
  });

  it('ответ сервера пришёл после смены аккаунта: копия согласий другого пользователя не затирается', async () => {
    await signIn();
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    await recordConsent('cloud', true, TEXT, undefined, NOW);
    const real = server.fetch;
    let deliver = (): void => undefined;
    const delivered = new Promise<void>((resolve) => (deliver = resolve));
    vi.mocked(globalThis.fetch).mockImplementationOnce(async (input, init) => {
      const answer = await real(input, init);
      await delivered;
      return answer;
    });
    const refreshing = refreshConsents(NOW);
    await waitFor(() => expect(consentRequests().at(-1)).toBe('GET'));

    // Boris signs in on the same device while Anna's answer is on its way.
    await signIn('boris@example.com');
    const boris = (await db.settings.get('account.consents'))?.value;
    expect(boris).toEqual({ userId: 'user-2', consents: {} });
    deliver();
    await refreshing;
    expect((await db.settings.get('account.consents'))?.value).toEqual(boris);
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.status).toBe('ready'));
    expect(consents.result.current.isGranted('cloud')).toBe(false);
  });

  it('номера строк журнала на сервере только растут: после удаления другого аккаунта отзыв получает номер больше прежнего согласия и действует', async () => {
    await signIn('boris@example.com');
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    await signIn();
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    await expect(recordConsent('cloud', true, TEXT, undefined, NOW)).resolves.toMatchObject({ id: 3 });
    // Boris deletes his account: his row leaves the journal.
    await signIn('boris@example.com');
    await deleteAccount(NOW);
    expect(server.journal.map((row) => row.id)).toEqual([2, 3]);

    await signIn();
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.isGranted('cloud')).toBe(true));
    await expect(recordConsent('cloud', false, TEXT, undefined, NOW)).resolves.toMatchObject({ id: 4, granted: false });
    await waitFor(() => expect(consents.result.current.isGranted('cloud')).toBe(false));
    expect(server.journal.map((row) => row.id)).toEqual([2, 3, 4]);
  });

  it('consentsAfterAnswer: ответ сервера заменяет копию; строка, записанная, пока ответ шёл, остаётся, если она позже ответа', () => {
    const row = (id: number, kind: Consent['kind'], granted: boolean): Consent => ({
      id,
      kind,
      granted,
      textVersion: TEXT,
      details: null,
      createdAt: '',
    });
    const before = { age: row(1, 'age', true), cloud: row(2, 'cloud', true) };
    // Nothing was recorded meanwhile: the answer is the truth, even where it knows less or an earlier row (a
    // server restored from a backup) — the copy never holds on to what the server does not have.
    expect(consentsAfterAnswer(before, before, { age: row(1, 'age', true) })).toEqual({ age: row(1, 'age', true) });
    // Recorded meanwhile and later than the answer: kept. Recorded meanwhile, but the answer knows a later row
    // (another device): the answer wins.
    const current = { ...before, cloud: row(5, 'cloud', false), analytics: row(6, 'analytics', true) };
    expect(consentsAfterAnswer(before, current, { age: row(1, 'age', true), cloud: row(2, 'cloud', true) })).toEqual({
      age: row(1, 'age', true),
      cloud: row(5, 'cloud', false),
      analytics: row(6, 'analytics', true),
    });
    expect(consentsAfterAnswer(before, current, { cloud: row(7, 'cloud', true) })).toEqual({
      cloud: row(7, 'cloud', true),
      analytics: row(6, 'analytics', true),
    });
  });

  it('вход без связи с журналом: состояние unknown — ничего не считается разрешённым, пока сервер не ответил', async () => {
    await requestSignIn(ANNA, { now: NOW });
    const real = server.fetch;
    vi.mocked(globalThis.fetch).mockImplementation((input, init) =>
      String(input).includes('/rest/v1/consents')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : real(input, init),
    );
    await completeSignIn({ code: server.letterTo(ANNA).code }, NOW);
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.status).toBe('unknown'));
    expect(consents.result.current.isGranted('cloud')).toBe(false);
    vi.mocked(globalThis.fetch).mockImplementation(real);
    await refreshConsents(NOW);
    await waitFor(() => expect(consents.result.current.status).toBe('ready'));
  });

  it('копия согласий другого пользователя на этом устройстве не действует', async () => {
    await signIn();
    await db.settings.put({
      key: 'account.consents',
      value: {
        userId: 'somebody-else',
        consents: { cloud: { id: 1, kind: 'cloud', granted: true, textVersion: TEXT, details: null, createdAt: '' } },
      },
    });
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.status).toBe('unknown'));
    expect(consents.result.current.isGranted('cloud')).toBe(false);
  });

  it('без входа согласие не записать; ответ сервера не по протоколу — ошибка, копия на устройстве не меняется', async () => {
    await expect(recordConsent('age', true, TEXT, { rule: '16+' }, NOW)).rejects.toMatchObject({ kind: 'signed_out' });
    await expect(refreshConsents(NOW)).rejects.toMatchObject({ kind: 'signed_out' });
    await signIn();
    const cached = await db.settings.get('account.consents');
    const answer = (status: number, body: unknown) =>
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
    answer(200, { not: 'rows' });
    await expect(refreshConsents(NOW)).rejects.toMatchObject({ kind: 'server' });
    answer(201, []);
    await expect(recordConsent('age', true, TEXT, { rule: '16+' }, NOW)).rejects.toMatchObject({ kind: 'server' });
    answer(401, { code: 'PGRST301', message: 'JWT expired' });
    await expect(refreshConsents(NOW)).rejects.toMatchObject({ kind: 'session_expired', status: 401 });
    answer(400, { code: '22023', message: 'consents: the age is confirmed by a rule' });
    await expect(recordConsent('age', true, TEXT, {}, NOW)).rejects.toMatchObject({ kind: 'server', status: 400 });
    expect(await db.settings.get('account.consents')).toEqual(cached);
  });
});

describe('contract #278: возраст', () => {
  it('Given возраст не подтверждён (нет действующей строки age) When клиент пытается записать другое согласие Then запрос отклонён: клиент проверяет сам и не отправляет его, а сервер отклоняет и запрос в обход клиента', async () => {
    await signIn();

    // The client: asks the server what is in force (the copy here may be behind another device), then refuses.
    await expect(recordConsent('cloud', true, TEXT, undefined, NOW)).rejects.toMatchObject({ kind: 'age_required' });
    expect(consentRequests()).toEqual(['GET', 'GET']);
    expect(server.journalOf(ANNA)).toEqual([]);

    // The server: the same request sent past the client is refused by the server itself.
    const direct = await server.fetch('https://api.kz.example/rest/v1/consents', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token-1' },
      body: JSON.stringify({ kind: 'cloud', granted: true, text_version: TEXT }),
    });
    expect([direct.status, await direct.json()]).toEqual([403, expect.objectContaining({ details: 'age_required' })]);
    expect(server.journalOf(ANNA)).toEqual([]);

    // Confirmed: the other consents are taken, and the device does not ask the server again before each of them.
    await recordConsent('age', true, TEXT, { rule: 'kz_guardian' }, NOW);
    await recordConsent('cloud', true, TEXT, undefined, NOW);
    await recordConsent('analytics', true, TEXT, undefined, NOW);
    expect(consentRequests()).toEqual(['GET', 'GET', 'POST', 'POST', 'POST', 'POST']);
    expect(server.journalOf(ANNA)).toEqual([
      ['age', true],
      ['cloud', true],
      ['analytics', true],
    ]);
  });

  it('возраст отозван на другом устройстве, а копия здесь отстала: отказ сервера приходит как age_required, и копия исправляется по журналу', async () => {
    await signIn();
    await recordConsent('age', true, TEXT, { rule: '16+' }, NOW);
    await server.fetch('https://api.kz.example/rest/v1/consents', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token-1' },
      body: JSON.stringify({ kind: 'age', granted: false, text_version: TEXT }),
    });
    await expect(recordConsent('cloud', true, TEXT, undefined, NOW)).rejects.toMatchObject({
      kind: 'age_required',
      status: 403,
    });
    expect(server.journalOf(ANNA)).toEqual([
      ['age', true],
      ['age', false],
    ]);
    // The refusal corrects the copy: it no longer says the age is confirmed, so the next try is refused here,
    // without one more request that the server would refuse the same way.
    expect((await db.settings.get('account.consents'))?.value).toMatchObject({
      consents: { age: { id: 2, granted: false } },
    });
    const before = consentRequests().length;
    await expect(recordConsent('cloud', true, TEXT, undefined, NOW)).rejects.toMatchObject({ kind: 'age_required' });
    expect(consentRequests().slice(before)).toEqual(['GET']);
    // Taking a consent back never needs the age.
    await expect(recordConsent('analytics', false, TEXT, undefined, NOW)).resolves.toMatchObject({ granted: false });
  });

  it('возраст подтверждён на другом устройстве: копия здесь отстала, клиент спрашивает сервер и записывает согласие', async () => {
    await signIn();
    await server.fetch('https://api.kz.example/rest/v1/consents', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token-1' },
      body: JSON.stringify({ kind: 'age', granted: true, text_version: TEXT, details: { rule: '16+' } }),
    });
    await expect(recordConsent('cloud', true, TEXT, undefined, NOW)).resolves.toMatchObject({ granted: true });
    const consents = renderHook(() => useConsents());
    await waitFor(() => expect(consents.result.current.isGranted('age')).toBe(true));
    expect(consents.result.current.isGranted('cloud')).toBe(true);
  });
});
