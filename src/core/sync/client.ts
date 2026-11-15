import { z } from 'zod';
import type { BackendConfig } from './config';
import type { PulledChange, PushResult, SyncChange } from './protocol';

/**
 * The transport of the sync (ADR-0009, sync p. 3, 4, 6): a thin `fetch` client of the two server functions of
 * `infra/supabase/migrations/` — no SDK, no Dexie, no rules. It never reads or writes local data: the engine
 * hands it changes built by `protocol.ts` and applies what comes back.
 *
 *   for await (const { results } of client.push(changes, { since })) …   // batch by batch
 *   for await (const page of client.pull(lastPulledRev)) …               // page by page
 *
 * A failed connection or a busy server (5xx, 408, 429) is retried with an exponential delay; any other answer is
 * an error for the caller at once (`SyncRequestError`). Nothing in the app calls this yet — turning the sync on is
 * the engine's and the settings screen's job.
 */

export interface SyncClientOptions {
  /** The region's backend, from `backendFor(region)`. */
  backend: BackendConfig;
  /** The signed-in user's access token; asked before every request, so a refreshed token is picked up. */
  accessToken: () => string | Promise<string>;
  /** Changes per push request (default 200; the server takes at most 500). */
  batchSize?: number;
  /** Changes per pull request (default 500; the server gives at most 1000). */
  pageSize?: number;
  /** Retries of one request after the first attempt (default 5). */
  maxRetries?: number;
  /** Delay before the first retry; doubles with every retry up to a minute (default 1000 ms). */
  retryDelayMs?: number;
  /** For tests: the network and the timer. */
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** One pushed batch and the server's answer for each of its changes (see `applyPushResult`). */
export interface PushBatch {
  changes: SyncChange[];
  results: PushResult[];
}

export interface SyncClient {
  /**
   * Sends the changes in batches, in order. Each batch is yielded as soon as the server has answered — what was
   * yielded is stored on the server even if a later batch fails. `since` is the device's `lastPulledRev`;
   * `replace` — «replace the data in the cloud» (`buildReplace`).
   */
  push(changes: readonly SyncChange[], options: { since: number; replace?: boolean }): AsyncGenerator<PushBatch>;
  /** Yields the changes after the cursor page by page, oldest first, until the server has no more. */
  pull(lastPulledRev: number): AsyncGenerator<PulledChange[]>;
}

/** A request that did not succeed. `retriable` — the connection or the server failed, the same call may work later. */
export class SyncRequestError extends Error {
  /** HTTP status; `undefined` when there was no answer at all (offline). */
  readonly status: number | undefined;
  /** The server's error code (PostgREST / Postgres), when it sent one. */
  readonly code: string | undefined;
  readonly retriable: boolean;

  constructor(message: string, details: { status?: number; code?: string; retriable: boolean }) {
    super(message);
    this.name = 'SyncRequestError';
    this.status = details.status;
    this.code = details.code;
    this.retriable = details.retriable;
  }
}

const MAX_RETRY_DELAY_MS = 60_000;
const RETRIABLE_STATUSES = new Set([408, 429]);

/** A row of `changes_since` and of `sync_push`: absent fields come as `null`. */
const serverRow = z.object({
  table: z.string(),
  key: z.string(),
  rev: z.number(),
  updatedAt: z.number(),
  updatedBy: z.string(),
  deletedAt: z.number().nullish(),
  data: z.record(z.string(), z.unknown()).nullish(),
});
const pulledRows = z.array(serverRow);
const pushedRows = z.array(serverRow.extend({ applied: z.boolean() }));

function toPulledChange(row: z.infer<typeof serverRow>): PulledChange {
  const { table, key, rev, updatedAt, updatedBy, deletedAt, data } = row;
  const version = { table, key, rev, updatedAt, updatedBy };
  return typeof deletedAt === 'number' ? { ...version, deletedAt } : { ...version, data: data ?? {} };
}

function toPushResult(row: z.infer<typeof pushedRows>[number]): PushResult {
  const { table, key, rev, updatedAt, applied } = row;
  return applied
    ? { table, key, rev, updatedAt, applied }
    : { table, key, rev, updatedAt, applied, current: toPulledChange(row) };
}

export function createSyncClient(options: SyncClientOptions): SyncClient {
  const { backend, accessToken, batchSize = 200, pageSize = 500, maxRetries = 5, retryDelayMs = 1000 } = options;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  /** One attempt: the parsed body, or a `SyncRequestError`. */
  async function attempt(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      apikey: backend.anonKey,
      Authorization: `Bearer ${await accessToken()}`,
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    };
    let response: Response;
    try {
      response = await send(`${backend.url}${path}`, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new SyncRequestError('Нет связи с сервером синхронизации', { retriable: true });
    }
    const answer: unknown = await response.json().catch(() => undefined);
    if (response.ok) return answer;
    const code = z.object({ code: z.string() }).safeParse(answer).data?.code;
    throw new SyncRequestError(`Сервер синхронизации ответил ошибкой ${response.status}`, {
      status: response.status,
      code,
      retriable: response.status >= 500 || RETRIABLE_STATUSES.has(response.status),
    });
  }

  /** A request with retries: 1 s, 2 s, 4 s … up to a minute between attempts. */
  async function request<T>(schema: z.ZodType<T>, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      try {
        const parsed = schema.safeParse(await attempt(method, path, body));
        if (parsed.success) return parsed.data;
        throw new SyncRequestError('Сервер синхронизации ответил не по протоколу', { retriable: false });
      } catch (error) {
        if (!(error instanceof SyncRequestError) || !error.retriable || retry >= maxRetries) throw error;
        await sleep(Math.min(retryDelayMs * 2 ** retry, MAX_RETRY_DELAY_MS));
      }
    }
  }

  return {
    async *push(changes, { since, replace = false }) {
      for (let start = 0; start < changes.length; start += batchSize) {
        const batch = changes.slice(start, start + batchSize);
        const rows = await request(pushedRows, 'POST', '/rest/v1/rpc/sync_push', { changes: batch, since, replace });
        yield { changes: batch, results: rows.map(toPushResult) };
      }
    },

    async *pull(lastPulledRev) {
      for (let cursor = lastPulledRev; ;) {
        const rows = await request(
          pulledRows,
          'GET',
          `/rest/v1/rpc/changes_since?since=${cursor}&max_rows=${pageSize}`,
        );
        if (rows.length > 0) yield rows.map(toPulledChange);
        if (rows.length < pageSize) return;
        cursor = Math.max(cursor, ...rows.map((row) => row.rev));
      }
    },
  };
}
