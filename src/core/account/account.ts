import { backendFor } from '../sync/config';
import { exchangeLinkCode, requestLetter, revokeSession, verifyCode } from './authApi';
import { refreshConsents, refusedByApi } from './consentStore';
import { AccountError } from './errors';
import { send } from './http';
import { createPkcePair } from './pkce';
import {
  authorized,
  eraseAccountOnDevice,
  getAccessToken,
  readStoredAccount,
  requireSignInBackend,
  sessionFrom,
  writeStoredAccount,
} from './session';

/**
 * Sign-in by e-mail, sign-out and account deletion (ADR-0009, design p. 9 and «Удаление»). None of these touches
 * the user's data on the device: an account only adds the cloud on top of it.
 */

/**
 * Asks the region's Auth server for the sign-in letter — ONE letter with a link and a six-digit code — and
 * remembers on this device that the sign-in is waiting (`useAccount()` → `pending`). A new address gets an account
 * when the sign-in is completed. `redirectTo` — the address of the app the link returns to (the server's
 * `SITE_URL` when omitted); it must be on the server's allow list.
 */
export async function requestSignIn(email: string, options: { redirectTo?: string; now?: number } = {}): Promise<void> {
  const backend = requireSignInBackend();
  const address = email.trim();
  if (!address.includes('@')) throw new AccountError('invalid_email');
  // Asking for a letter while signed in is «sign in as somebody else»: the current session ends first.
  if ((await readStoredAccount())?.state === 'signedIn') await signOut(options.now);
  const pkce = await createPkcePair();
  await requestLetter(backend, address, pkce, options.redirectTo);
  await writeStoredAccount({
    state: 'pending',
    region: backend.region,
    email: address,
    verifier: pkce.verifier,
    requestedAt: options.now ?? Date.now(),
  });
}

/**
 * The `?code=` the link of the letter came back with, or `null`. It is read from the query — the part of the
 * address BEFORE `#` — because the app's routes live after `#` (HashRouter):
 * `https://app.example/?code=…#/settings`.
 */
export function signInCodeFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('code') || null;
  } catch {
    return null;
  }
}

/**
 * Completes the sign-in this device asked for, either way:
 * `{ code }` — the six digits of the letter typed in the app (the only way in the native shell, where the link
 * opens a browser); `{ linkCode }` — the `?code=` of the link (`signInCodeFromUrl(location.href)`), which works
 * only on the device that asked for the letter.
 * After it `useAccount()` is `signedIn` and the consents in force are on the device.
 */
export async function completeSignIn(
  proof: { code: string } | { linkCode: string },
  now: number = Date.now(),
): Promise<void> {
  requireSignInBackend();
  const pending = await readStoredAccount();
  if (pending?.state !== 'pending') throw new AccountError('no_pending_sign_in');
  const backend = backendFor(pending.region);
  if (!backend) throw new AccountError('unavailable');
  const issued =
    'code' in proof
      ? await verifyCode(backend, pending.email, proof.code.trim())
      : await exchangeLinkCode(backend, proof.linkCode, pending.verifier);
  await writeStoredAccount(sessionFrom(issued, backend, now));
  // The consents given on another device: without them the sign-in still stands — `refreshConsents()` can be
  // called again when the network is back.
  await refreshConsents(now).catch(() => undefined);
}

/**
 * Signs out on this device: the session is revoked on the server (this session only — other devices stay signed
 * in) and erased here together with the cached consents. The user's data on the device is not touched.
 * Offline the session is still erased here; `revokedOnServer: false` says the server could not be told.
 */
export async function signOut(now: number = Date.now()): Promise<{ revokedOnServer: boolean }> {
  const stored = await readStoredAccount();
  const backend = stored ? backendFor(stored.region) : null;
  let revokedOnServer = false;
  if (stored?.state === 'signedIn' && backend) {
    try {
      await revokeSession(backend, await getAccessToken(now));
      revokedOnServer = true;
    } catch (error) {
      // A session the server no longer knows is as revoked as it gets.
      revokedOnServer = error instanceof AccountError && error.kind === 'session_expired';
    }
  }
  await eraseAccountOnDevice();
  return { revokedOnServer };
}

/**
 * Deletes the account: the server removes the user's rows in every data table, the profile, the consent journal
 * and the Auth user (`delete_account()` in `infra/supabase/migrations/`), then the session is erased on this
 * device. The data on the device stays until the user removes it. On any error nothing changes here.
 */
export async function deleteAccount(now: number = Date.now()): Promise<void> {
  const { backend, accessToken } = await authorized(now);
  const answer = await send(backend, '/rest/v1/rpc/delete_account', { method: 'POST', accessToken, body: {} });
  if (!answer.ok) throw refusedByApi(answer);
  await eraseAccountOnDevice();
}
