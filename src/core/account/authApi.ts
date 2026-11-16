import { z } from 'zod';
import type { BackendConfig } from '../sync/config';
import { AccountError } from './errors';
import { commonFailure, errorField, send, type Answer } from './http';
import type { PkcePair } from './pkce';

/**
 * The Auth server of a region (`/auth/v1`, GoTrue) — sign-in by e-mail only (ADR-0009, design p. 9): one letter
 * with a link and a six-digit code, no passwords, no Google or other outside providers. No Dexie and no React
 * here: `session.ts` stores what these calls return.
 */

/** A session as the server issued it. The tokens are credentials: never log them, never put them into an error. */
export interface IssuedSession {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  /** Lifetime of the access token, seconds. */
  expiresIn: number;
}

const issuedSession = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  user: z.object({ id: z.string().min(1), email: z.string() }),
});

function toSession(answer: Answer): IssuedSession {
  const parsed = issuedSession.safeParse(answer.body);
  if (!parsed.success) throw new AccountError('server', answer.status);
  const { access_token, refresh_token, expires_in, user } = parsed.data;
  return {
    userId: user.id,
    email: user.email,
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresIn: expires_in,
  };
}

/** Auth says with these codes that the region registers no new accounts (`DISABLE_SIGNUP`). */
const SIGN_UP_CLOSED = new Set(['signup_disabled', 'otp_disabled', 'email_provider_disabled']);

/**
 * Asks the server to send the sign-in letter: one letter with a link and a six-digit code; a new address gets an
 * account (and its profile with the region of this deployment) when the sign-in is completed.
 * `redirectTo` — where the link brings the user back; without it the server uses the region's `SITE_URL`.
 */
export async function requestLetter(
  backend: BackendConfig,
  email: string,
  pkce: PkcePair,
  redirectTo?: string,
): Promise<void> {
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  const answer = await send(backend, `/auth/v1/otp${query}`, {
    method: 'POST',
    body: { email, create_user: true, code_challenge: pkce.challenge, code_challenge_method: pkce.method },
  });
  if (answer.ok) return;
  const common = commonFailure(answer);
  if (common) throw common;
  if (SIGN_UP_CLOSED.has(errorField(answer.body, 'error_code') ?? '')) {
    throw new AccountError('sign_up_closed', answer.status);
  }
  throw new AccountError('invalid_email', answer.status);
}

/** A sign-in request the server refused: the code (or the link) is wrong, used or expired. */
function codeRefused(answer: Answer): AccountError {
  return commonFailure(answer) ?? new AccountError('invalid_code', answer.status);
}

/** Completes the sign-in with the six-digit code of the letter, typed in the app. */
export async function verifyCode(backend: BackendConfig, email: string, code: string): Promise<IssuedSession> {
  const answer = await send(backend, '/auth/v1/verify', {
    method: 'POST',
    body: { type: 'email', email, token: code },
  });
  if (!answer.ok) throw codeRefused(answer);
  return toSession(answer);
}

/** Completes the sign-in with the `?code=` the link of the letter came back with, and the verifier kept here. */
export async function exchangeLinkCode(
  backend: BackendConfig,
  linkCode: string,
  verifier: string,
): Promise<IssuedSession> {
  const answer = await send(backend, '/auth/v1/token?grant_type=pkce', {
    method: 'POST',
    body: { auth_code: linkCode, code_verifier: verifier },
  });
  if (!answer.ok) throw codeRefused(answer);
  return toSession(answer);
}

/** A new access token for a session whose token has expired. A refused refresh token — the session is over. */
export async function refreshSession(backend: BackendConfig, refreshToken: string): Promise<IssuedSession> {
  const answer = await send(backend, '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
  if (!answer.ok) throw commonFailure(answer) ?? new AccountError('session_expired', answer.status);
  return toSession(answer);
}

/** Revokes THIS session on the server (`scope=local`): the user's other devices stay signed in. */
export async function revokeSession(backend: BackendConfig, accessToken: string): Promise<void> {
  const answer = await send(backend, '/auth/v1/logout?scope=local', { method: 'POST', accessToken });
  // 401/403/404: the server does not know the session any more — nothing is left to revoke.
  if (answer.ok || [401, 403, 404].includes(answer.status)) return;
  throw commonFailure(answer) ?? new AccountError('server', answer.status);
}
