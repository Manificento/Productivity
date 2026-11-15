import { describe, expect, it, vi } from 'vitest';
import { createSyncClient, SyncRequestError, type SyncClientOptions } from './client';
import type { PulledChange, SyncChange } from './protocol';

const backend = { region: 'kz', url: 'https://api.kz.example', anonKey: 'anon-kz' } as const;

const change = (key: string): SyncChange => ({
  table: 'tasks',
  key,
  updatedAt: 100,
  updatedBy: 'device-a',
  data: { title: key },
});
/** A row as the server answers: absent fields come as `null`. */
const row = (key: string, rev: number, extra: Record<string, unknown> = {}) => ({
  table: 'tasks',
  key,
  rev,
  updatedAt: 100,
  updatedBy: 'device-a',
  deletedAt: null,
  data: { title: key },
  ...extra,
});
const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
const failure = (status: number, body: unknown = {}): Response => new Response(JSON.stringify(body), { status });

/** The network is always a mock: `responses` are answered in order; an `Error` is a failed connection. */
function setup(responses: (Response | Error)[], options: Partial<SyncClientOptions> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetch.mockRejectedValueOnce(response);
    else fetch.mockResolvedValueOnce(response);
  }
  const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
  const accessToken = vi.fn(() => 'token-of-the-user');
  const client = createSyncClient({ backend, accessToken, fetch, sleep, ...options });
  const requests = () =>
    fetch.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: init?.method,
      headers: init?.headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }));
  return { client, fetch, sleep, accessToken, requests };
}

async function collect<T>(pages: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const page of pages) all.push(page);
  return all;
}

describe('createSyncClient — тонкий транспорт синхронизации', () => {
  it('push пачками: изменения уходят по batchSize за запрос, по порядку, с курсором и токеном пользователя', async () => {
    const changes = ['a', 'b', 'c', 'd', 'e'].map(change);
    const { client, requests } = setup(
      [
        ok([row('a', 11, { applied: true, data: null }), row('b', 12, { applied: true, data: null })]),
        ok([row('c', 13, { applied: true, data: null }), row('d', 14, { applied: true, data: null })]),
        ok([row('e', 15, { applied: true, data: null })]),
      ],
      { batchSize: 2 },
    );

    const batches = await collect(client.push(changes, { since: 10 }));

    expect(requests()).toEqual(
      [changes.slice(0, 2), changes.slice(2, 4), changes.slice(4)].map((batch) => ({
        url: 'https://api.kz.example/rest/v1/rpc/sync_push',
        method: 'POST',
        headers: {
          apikey: 'anon-kz',
          Authorization: 'Bearer token-of-the-user',
          'Content-Type': 'application/json',
        },
        body: { changes: batch, since: 10, replace: false },
      })),
    );
    expect(batches.map((batch) => batch.changes)).toEqual([changes.slice(0, 2), changes.slice(2, 4), changes.slice(4)]);
    expect(batches[2].results).toEqual([{ table: 'tasks', key: 'e', rev: 15, updatedAt: 100, applied: true }]);
  });

  it('push: непринятое изменение приходит с версией сервера (current); tombstone — без содержимого', async () => {
    const { client } = setup([
      ok([
        row('a', 7, { applied: false, updatedAt: 500, updatedBy: 'device-b', data: { title: 'с сервера' } }),
        row('b', 8, { applied: false, updatedAt: 600, updatedBy: 'device-b', deletedAt: 600, data: null }),
      ]),
    ]);
    const [{ results }] = await collect(client.push([change('a'), change('b')], { since: 0 }));
    expect(results).toEqual([
      {
        table: 'tasks',
        key: 'a',
        rev: 7,
        updatedAt: 500,
        applied: false,
        current: {
          table: 'tasks',
          key: 'a',
          rev: 7,
          updatedAt: 500,
          updatedBy: 'device-b',
          data: { title: 'с сервера' },
        },
      },
      {
        table: 'tasks',
        key: 'b',
        rev: 8,
        updatedAt: 600,
        applied: false,
        current: { table: 'tasks', key: 'b', rev: 8, updatedAt: 600, updatedBy: 'device-b', deletedAt: 600 },
      },
    ]);
  });

  it('push с replace: «заменить данные в облаке» передаётся серверу', async () => {
    const { client, requests } = setup([ok([row('a', 1, { applied: true })])]);
    await collect(client.push([change('a')], { since: 3, replace: true }));
    expect(requests()[0].body).toEqual({ changes: [change('a')], since: 3, replace: true });
  });

  it('push без изменений не делает запросов', async () => {
    const { client, fetch } = setup([]);
    expect(await collect(client.push([], { since: 0 }))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pull по курсору lastPulledRev: страницы запрашиваются с последнего полученного rev, пока страница не короче pageSize', async () => {
    const { client, requests } = setup(
      [
        ok([row('a', 5), row('b', 6)]),
        ok([row('c', 7, { deletedAt: 300, data: null }), row('d', 9)]),
        ok([row('e', 12)]),
      ],
      { pageSize: 2 },
    );

    const pages = await collect(client.pull(4));

    expect(requests().map(({ url, method, body }) => [method, url, body])).toEqual([
      ['GET', 'https://api.kz.example/rest/v1/rpc/changes_since?since=4&max_rows=2', undefined],
      ['GET', 'https://api.kz.example/rest/v1/rpc/changes_since?since=6&max_rows=2', undefined],
      ['GET', 'https://api.kz.example/rest/v1/rpc/changes_since?since=9&max_rows=2', undefined],
    ]);
    expect(requests()[0].headers).toEqual({ apikey: 'anon-kz', Authorization: 'Bearer token-of-the-user' });
    expect(pages.map((page) => page.map((c) => c.rev))).toEqual([[5, 6], [7, 9], [12]]);
    const tombstone: PulledChange = {
      table: 'tasks',
      key: 'c',
      rev: 7,
      updatedAt: 100,
      updatedBy: 'device-a',
      deletedAt: 300,
    };
    expect(pages[1][0]).toEqual(tombstone);
    expect(pages[0][0]).toEqual({ ...tombstone, key: 'a', rev: 5, deletedAt: undefined, data: { title: 'a' } });
  });

  it('pull: полная страница, которая не двигает курсор, — ошибка, а не бесконечный цикл', async () => {
    const { client, fetch } = setup([ok([row('a', 3), row('b', 4)])], { pageSize: 2 });
    const error = await collect(client.pull(4)).catch((e: unknown) => e);
    expect(error).toMatchObject({ retriable: false, message: 'Сервер синхронизации ответил не по протоколу' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('pull: на сервере ничего нового — ни одной страницы', async () => {
    const { client, fetch } = setup([ok([])]);
    expect(await collect(client.pull(40))).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('токен спрашивается перед каждым запросом — обновлённый токен подхватывается', async () => {
    const tokens = ['first', 'second'];
    const { client, requests } = setup([ok([row('a', 1)]), ok([])], {
      pageSize: 1,
      accessToken: () => Promise.resolve(tokens.shift() ?? ''),
    });
    await collect(client.pull(0));
    expect(requests().map((request) => (request.headers as Record<string, string>).Authorization)).toEqual([
      'Bearer first',
      'Bearer second',
    ]);
  });

  it('повтор с экспоненциальной задержкой: ошибка сети и 5xx повторяются через 1, 2, 4… секунды', async () => {
    const { client, fetch, sleep } = setup([
      new TypeError('Failed to fetch'),
      failure(503),
      failure(429),
      ok([row('a', 1, { applied: true })]),
    ]);

    const batches = await collect(client.push([change('a')], { since: 0 }));

    expect(batches).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[1000], [2000], [4000]]);
  });

  it('задержка не растёт выше минуты, а после maxRetries повторов ошибка отдаётся вызывающему', async () => {
    const down = Array.from({ length: 9 }, () => failure(502));
    const { client, fetch, sleep } = setup(down, { maxRetries: 8 });

    const error = await collect(client.pull(0)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SyncRequestError);
    expect(error).toMatchObject({ status: 502, retriable: true });
    expect(fetch).toHaveBeenCalledTimes(9);
    expect(sleep.mock.calls.flat()).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });

  it('сеть так и не появилась — ошибка без статуса, локальные данные транспорт не трогает', async () => {
    const offline = Array.from({ length: 3 }, () => new TypeError('Failed to fetch'));
    const { client } = setup(offline, { maxRetries: 2 });
    const error = await collect(client.push([change('a')], { since: 0 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncRequestError);
    expect(error).toMatchObject({ status: undefined, retriable: true, message: 'Нет связи с сервером синхронизации' });
  });

  it('ошибка запроса (401, 403, 400) не повторяется и несёт код сервера', async () => {
    for (const status of [400, 401, 403]) {
      const { client, fetch, sleep } = setup([failure(status, { code: '28000', message: 'sync_push: sign in first' })]);
      const error = await collect(client.push([change('a')], { since: 0 })).catch((e: unknown) => e);
      expect(error).toMatchObject({ status, code: '28000', retriable: false });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('пачка, отправленная до ошибки, уже отдана вызывающему: её не нужно отправлять заново', async () => {
    const { client } = setup([ok([row('a', 1, { applied: true })]), failure(400)], { batchSize: 1 });
    const done: string[] = [];
    const error = await (async () => {
      for await (const batch of client.push([change('a'), change('b')], { since: 0 })) done.push(batch.changes[0].key);
    })().catch((e: unknown) => e);
    expect(done).toEqual(['a']);
    expect(error).toBeInstanceOf(SyncRequestError);
  });

  it('ответ не того вида (не JSON, не массив строк) — ошибка, а не тихо пустой результат', async () => {
    for (const body of [new Response('<html>', { status: 200 }), ok({ rows: [] }), ok([{ table: 'tasks' }])]) {
      const { client } = setup([body]);
      const error = await collect(client.pull(0)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SyncRequestError);
      expect(error).toMatchObject({ retriable: false, message: 'Сервер синхронизации ответил не по протоколу' });
    }
  });
});

describe('включения в UI нет', () => {
  it('транспорт импортирует только ядро: ни оболочка, ни модули, ни UI-кит его не подключают', () => {
    const sources = import.meta.glob<string>(
      ['../../app/**/*.{ts,tsx}', '../../modules/**/*.{ts,tsx}', '../../ui/**/*.{ts,tsx}'],
      {
        query: '?raw',
        import: 'default',
        eager: true,
      },
    );
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    const users = Object.entries(sources)
      .filter(([, source]) => /core\/sync\/(client|protocol)['"]/.test(source))
      .map(([path]) => path);
    expect(users).toEqual([]);
  });
});
