import { z } from 'zod';
import { db, softDeleteMany } from '../db';
import { backendFor, REGIONS, signInBackend, type BackendConfig, type Region } from '../sync/config';
import { ACCOUNT_CONSENTS_KEY, ACCOUNT_SESSION_KEY } from '../sync/localOnly';
import { refreshSession, type IssuedSession } from './authApi';
import { AccountError } from './errors';

/**
 * The account on THIS DEVICE: one row of `settings`, `account.session` — a sign-in that waits for its code, or
 * the session with its tokens. It is device state (`core/sync/localOnly.ts`): never queued for the sync, never
 * written to a backup and kept through an import. The tokens are credentials — nothing here logs them.
 *
 * The region is the cell whose Auth issued the session: each region has its own Auth and its own users
 * (ADR-0009), and the server writes the same region into the user's profile when the account is created.
 */

const region = z.enum(REGIONS);

const pendingSignIn = z.object({
  state: z.literal('pending'),
  region,
  email: z.string().min(1),
  /** PKCE verifier (`pkce.ts`): turns the `?code=` of the letter's link into a session, on this device only. */
  verifier: z.string().min(1),
  requestedAt: z.number(),
});

const signedIn = z.object({
  state: z.literal('signedIn'),
  region,
  userId: z.string().min(1),
  email: z.string(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** When the access token stops working, by this device's clock. */
  expiresAt: z.number(),
});

const storedAccount = z.discriminatedUnion('state', [pendingSignIn, signedIn]);

export type PendingSignIn = z.infer<typeof pendingSignIn>;
export type SignedIn = z.infer<typeof signedIn>;
export type StoredAccount = z.infer<typeof storedAccount>;

/** What the app may know about the account — no tokens in here. */
export type AccountState =
  /** This build has no cloud backend (or none for the region of the stored session): the app is local-only. */
  | { status: 'unavailable' }
  /** The device's state is being read. */
  | { status: 'loading' }
  | { status: 'signedOut' }
  /** A letter went to `email`; `completeSignIn` waits for its code or its link. */
  | { status: 'pending'; email: string; region: Region }
  | { status: 'signedIn'; email: string; userId: string; region: Region };

/** A token is refreshed this long before it expires, so a request never leaves with a token about to die. */
export const REFRESH_MARGIN_MS = 60_000;

/** The stored value of `account.session`; anything that is not one of the two shapes counts as «no account». */
export function parseStoredAccount(value: unknown): StoredAccount | null {
  return storedAccount.safeParse(value).data ?? null;
}

export async function readStoredAccount(): Promise<StoredAccount | null> {
  return parseStoredAccount((await db.settings.get(ACCOUNT_SESSION_KEY))?.value);
}

export async function writeStoredAccount(account: StoredAccount): Promise<void> {
  await db.settings.put({ key: ACCOUNT_SESSION_KEY, value: account });
}

/** Removes the session and the cached consents from this device. The user's data stays where it is. */
export async function eraseAccountOnDevice(): Promise<void> {
  await softDeleteMany(db.settings, [ACCOUNT_SESSION_KEY, ACCOUNT_CONSENTS_KEY]);
}

export function sessionFrom(issued: IssuedSession, backend: BackendConfig, now: number): SignedIn {
  const { userId, email, accessToken, refreshToken, expiresIn } = issued;
  return {
    state: 'signedIn',
    region: backend.region,
    userId,
    email,
    accessToken,
    refreshToken,
    expiresAt: now + expiresIn * 1000,
  };
}

/** `useAccount()` without React: `row` is the `settings` row, `null` when there is none, `undefined` while read. */
export function accountStateOf(row: { value: unknown } | null | undefined): AccountState {
  if (!signInBackend()) return { status: 'unavailable' };
  if (row === undefined) return { status: 'loading' };
  const stored = parseStoredAccount(row?.value);
  if (!stored) return { status: 'signedOut' };
  if (!backendFor(stored.region)) return { status: 'unavailable' };
  const { email } = stored;
  return stored.state === 'pending'
    ? { status: 'pending', email, region: stored.region }
    : { status: 'signedIn', email, userId: stored.userId, region: stored.region };
}

/** The backend new sign-ins go to; a build without one makes no account request at all. */
export function requireSignInBackend(): BackendConfig {
  const backend = signInBackend();
  if (!backend) throw new AccountError('unavailable');
  return backend;
}

/** The session of this device with the backend of its region, or the reason there is none. */
export async function requireSession(): Promise<{ session: SignedIn; backend: BackendConfig }> {
  requireSignInBackend();
  const stored = await readStoredAccount();
  if (stored?.state !== 'signedIn') throw new AccountError('signed_out');
  const backend = backendFor(stored.region);
  if (!backend) throw new AccountError('unavailable');
  return { session: stored, backend };
}

/** One refresh at a time: every caller that finds the token expired waits for the same answer. */
let refreshing: Promise<string> | null = null;

async function refresh(backend: BackendConfig, session: SignedIn, now: number): Promise<string> {
  // The stored session is touched only while it is still the one this refresh started from: a sign-out or a
  // refresh in another tab may have replaced it meanwhile.
  const ifUnchanged = (change: () => Promise<void>) =>
    db.transaction('rw', db.settings, async () => {
      const current = await readStoredAccount();
      if (current?.state === 'signedIn' && current.refreshToken === session.refreshToken) await change();
    });
  let issued: IssuedSession;
  try {
    issued = await refreshSession(backend, session.refreshToken);
  } catch (error) {
    // The server no longer knows the session: it is over on this device too. The user's data is not touched.
    if (error instanceof AccountError && error.kind === 'session_expired') await ifUnchanged(eraseAccountOnDevice);
    throw error;
  }
  await ifUnchanged(() => writeStoredAccount(sessionFrom(issued, backend, now)));
  return issued.accessToken;
}

/**
 * The access token of the signed-in user for a request to the region's API — refreshed first when it has expired
 * (or is about to). This is the `accessToken` of `createSyncClient`. Fails with `AccountError`: `signed_out`,
 * `session_expired` (the session is erased on the device), `network` (the session stays), `unavailable`.
 */
export async function getAccessToken(now: number = Date.now()): Promise<string> {
  const { session, backend } = await requireSession();
  if (session.expiresAt - now > REFRESH_MARGIN_MS) return session.accessToken;
  refreshing ??= refresh(backend, session, now).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** The token, the user and the backend for one authorized request. */
export async function authorized(
  now: number = Date.now(),
): Promise<{ backend: BackendConfig; accessToken: string; userId: string }> {
  const { session, backend } = await requireSession();
  return { backend, accessToken: await getAccessToken(now), userId: session.userId };
}
