import { AGE_RULES, CONSENT_KINDS } from '../core/account';

/**
 * The account side of ONE region's backend in memory, behind a `fetch` — for tests of `core/account/` and of the
 * screens above it, without a network:
 *
 *   const server = new FakeAccountServer();
 *   vi.stubGlobal('fetch', server.fetch);
 *
 * It answers like Auth (`/auth/v1`: letter, code, link, refresh, logout) and like the API of
 * `infra/supabase/migrations/0002_account_consents.sql` (`/rest/v1/consents`, `/rest/v1/rpc/delete_account`),
 * with the same rules: the journal is append-only, a row belongs to the user of the token and carries the server's
 * time, the age comes before any other consent, a deleted account leaves nothing. The same rules are checked on the
 * real server by `infra/supabase/tests/account.test.sh`; nothing compares this file with the migration — whoever
 * changes a rule there changes it here by hand.
 */

export interface Letter {
  email: string;
  /** The six digits of the letter. */
  code: string;
  /** The `?code=` the link of the letter comes back with. */
  linkCode: string;
  challenge: string;
  method: string;
  used: boolean;
}

export interface RecordedRequest {
  method: string;
  /** Path and query, without the origin. */
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

interface JournalRow {
  id: number;
  user_id: string;
  kind: string;
  granted: boolean;
  text_version: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const json = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function sha256Base64Url(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export class FakeAccountServer {
  readonly origin: string;
  /** Every letter the server «sent», oldest first. */
  readonly letters: Letter[] = [];
  /** Every request that reached the server, oldest first. */
  readonly requests: RecordedRequest[] = [];
  /** The consent journal of all users. */
  readonly journal: JournalRow[] = [];
  /** No answer at all: every request fails like a lost connection. */
  offline = false;
  /** Lifetime of an access token, seconds. */
  expiresIn = 3600;
  /** The server's clock. */
  now: () => number = () => Date.now();

  private readonly users = new Map<string, { id: string; email: string }>();
  private sessions: Session[] = [];
  private issued = 0;
  /** The number of the last journal row. It only grows, like the server's sequence: a deleted row's is not reused. */
  private lastRowId = 0;

  constructor(origin = 'https://api.kz.example') {
    this.origin = origin;
  }

  /** The last letter sent to the address. */
  letterTo(email: string): Letter {
    const letter = this.letters.findLast((sent) => sent.email === email);
    if (!letter) throw new Error(`no letter was sent to ${email}`);
    return letter;
  }

  /** Whether the server still knows a session with this refresh token. */
  hasSession(refreshToken: string): boolean {
    return this.sessions.some((session) => session.refreshToken === refreshToken);
  }

  hasUser(email: string): boolean {
    return this.users.has(email);
  }

  /** The journal of one user, oldest first, as `[kind, granted]`. */
  journalOf(email: string): [kind: string, granted: boolean][] {
    const id = this.users.get(email)?.id;
    return this.journal.filter((row) => row.user_id === id).map((row) => [row.kind, row.granted]);
  }

  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const method = init?.method ?? 'GET';
    if (this.offline) throw new TypeError('Failed to fetch');
    this.requests.push({ method, path: url.pathname + url.search, headers, body });
    if (url.origin !== this.origin) return json(404, { message: 'no such host' });
    return this.route(method, url, headers, (body ?? {}) as Record<string, unknown>);
  };

  private async route(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const path = url.pathname;
    const grant = url.searchParams.get('grant_type');
    const token = (headers.authorization ?? '').replace(/^Bearer /, '');
    if (method === 'POST' && path === '/auth/v1/otp') return this.sendLetter(body);
    if (method === 'POST' && path === '/auth/v1/verify') return this.verifyCode(body);
    if (method === 'POST' && path === '/auth/v1/token' && grant === 'pkce') return this.exchange(body);
    if (method === 'POST' && path === '/auth/v1/token' && grant === 'refresh_token') return this.refresh(body);
    // Everything below needs the access token of a session the server knows.
    const session = this.sessions.find((known) => known.accessToken === token);
    if (!session) return json(401, { code: 'PGRST301', message: 'JWT expired' });
    if (method === 'POST' && path === '/auth/v1/logout') {
      this.sessions = this.sessions.filter((known) => known !== session);
      return json(204);
    }
    if (method === 'GET' && path === '/rest/v1/consents') {
      return json(
        200,
        this.journal
          .filter((row) => row.user_id === session.userId)
          .toReversed()
          .map(withoutUser),
      );
    }
    if (method === 'POST' && path === '/rest/v1/consents') return this.addConsent(session.userId, body);
    if (method === 'POST' && path === '/rest/v1/rpc/delete_account') {
      this.sessions = this.sessions.filter((known) => known.userId !== session.userId);
      for (const [email, user] of this.users) if (user.id === session.userId) this.users.delete(email);
      this.journal.splice(0, this.journal.length, ...this.journal.filter((row) => row.user_id !== session.userId));
      return json(204);
    }
    return json(404, { message: 'no such route' });
  }

  private sendLetter(body: Record<string, unknown>): Response {
    const email = String(body.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json(400, { code: 400, error_code: 'validation_failed', msg: 'Unable to validate email address' });
    }
    const number = this.letters.length + 1;
    this.letters.push({
      email,
      code: String(100000 + number * 111).slice(0, 6),
      linkCode: `link-code-${number}`,
      challenge: String(body.code_challenge),
      method: String(body.code_challenge_method),
      used: false,
    });
    return json(200, {});
  }

  private issue(email: string): Response {
    const user = this.users.get(email) ?? { id: `user-${this.users.size + 1}`, email };
    this.users.set(email, user);
    this.issued += 1;
    const session = {
      userId: user.id,
      accessToken: `access-token-${this.issued}`,
      refreshToken: `refresh-token-${this.issued}`,
    };
    this.sessions.push(session);
    return json(200, {
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      token_type: 'bearer',
      expires_in: this.expiresIn,
      user,
    });
  }

  private verifyCode(body: Record<string, unknown>): Response {
    const letter = this.letters.findLast((sent) => sent.email === body.email);
    if (body.type !== 'email' || !letter || letter.used || letter.code !== body.token) {
      return json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    }
    letter.used = true;
    return this.issue(letter.email);
  }

  private async exchange(body: Record<string, unknown>): Promise<Response> {
    const letter = this.letters.find((sent) => sent.linkCode === body.auth_code);
    if (!letter || letter.used) {
      return json(404, { code: 404, error_code: 'flow_state_not_found', msg: 'invalid flow state' });
    }
    const verifier = String(body.code_verifier);
    const expected = letter.method === 's256' ? await sha256Base64Url(verifier) : verifier;
    if (expected !== letter.challenge) {
      return json(400, { code: 400, error_code: 'bad_code_verifier', msg: 'code challenge does not match' });
    }
    letter.used = true;
    return this.issue(letter.email);
  }

  private refresh(body: Record<string, unknown>): Response {
    const session = this.sessions.find((known) => known.refreshToken === body.refresh_token);
    if (!session) {
      return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
    this.sessions = this.sessions.filter((known) => known !== session);
    const email = [...this.users.values()].find((user) => user.id === session.userId)?.email ?? '';
    return this.issue(email);
  }

  /** The rules of the trigger `consents_before_insert`. */
  private addConsent(userId: string, body: Record<string, unknown>): Response {
    const { kind, granted, text_version: textVersion } = body;
    const details = (body.details ?? null) as Record<string, unknown> | null;
    if ('user_id' in body || 'created_at' in body || 'id' in body) {
      return json(403, { code: '42501', message: 'permission denied for table consents' });
    }
    if (
      !(CONSENT_KINDS as readonly unknown[]).includes(kind) ||
      typeof granted !== 'boolean' ||
      typeof textVersion !== 'string' ||
      textVersion === ''
    ) {
      return json(400, { code: '23514', message: 'new row violates a check constraint' });
    }
    if (kind === 'age' && granted && !(AGE_RULES as readonly unknown[]).includes(details?.rule)) {
      return json(400, { code: '22023', message: 'consents: the age is confirmed by a rule' });
    }
    const ageInForce = this.journal.findLast((row) => row.user_id === userId && row.kind === 'age')?.granted === true;
    if (kind !== 'age' && granted && !ageInForce) {
      return json(403, { code: '42501', message: 'consents: confirm the age first', details: 'age_required' });
    }
    this.lastRowId += 1;
    const row: JournalRow = {
      id: this.lastRowId,
      user_id: userId,
      kind: String(kind),
      granted,
      text_version: textVersion,
      details,
      created_at: new Date(this.now()).toISOString(),
    };
    this.journal.push(row);
    return json(201, [withoutUser(row)]);
  }
}

function withoutUser(row: JournalRow): Omit<JournalRow, 'user_id'> {
  const { id, kind, granted, text_version, details, created_at } = row;
  return { id, kind, granted, text_version, details, created_at };
}
