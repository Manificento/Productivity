import type { BackendConfig } from '../sync/config';
import { AccountError } from './errors';

/**
 * One request to a region's API gateway — a thin `fetch`, no SDK (ADR-0009, design p. 9). Account requests are
 * asked for by a person looking at the screen, so nothing is retried here: the screen offers «повторить».
 */

export interface Answer {
  status: number;
  ok: boolean;
  /** The parsed JSON body; `undefined` when there was none. */
  body: unknown;
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  /** The user's access token; without it the request goes with the public key of the region alone. */
  accessToken?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * How long a request may take. A connection that is open and silent would otherwise wait for ever — and `signOut()`
 * waits for the server before it erases the session on the device.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Sends the request and reads the answer; no answer at all — or none within `REQUEST_TIMEOUT_MS` — is
 * `AccountError('network')`.
 */
export async function send(backend: BackendConfig, path: string, options: RequestOptions): Promise<Answer> {
  const { method, accessToken, body, headers } = options;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await globalThis.fetch(`${backend.url}${path}`, {
        method,
        headers: {
          apikey: backend.anonKey,
          Authorization: `Bearer ${accessToken ?? backend.anonKey}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...headers,
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: timeout.signal,
      });
    } catch {
      throw new AccountError('network');
    }
    const parsed: unknown = await response.json().catch(() => undefined);
    // The headers came in time and the body did not: that is no answer either.
    if (timeout.signal.aborted) throw new AccountError('network');
    return { status: response.status, ok: response.ok, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

/** A string field of an error body (`error_code` of Auth, `code` and `details` of PostgREST), if it is there. */
export function errorField(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

/** What every failed answer means regardless of the request: a busy server or too many attempts. */
export function commonFailure(answer: Answer): AccountError | undefined {
  if (answer.status === 429) return new AccountError('rate_limited', 429);
  if (answer.status >= 500) return new AccountError('server', answer.status);
  return undefined;
}
