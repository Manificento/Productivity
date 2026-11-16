import { AccountError } from './errors';

/**
 * PKCE (RFC 7636) for the link of the sign-in letter: the device keeps a random `verifier` and sends its hash with
 * the request for the letter; the `?code=` the link comes back with is worth a session only together with the
 * verifier — so that code, seen in an address bar, a history or a log, signs nobody in on another device.
 *
 * PKCE protects that code and nothing else. The letter itself is a bearer credential for as long as it lives
 * (`OTP_EXPIRY`): whoever reads it has the six-digit code, which signs in on any device.
 */

export interface PkcePair {
  /** Stays on this device until the sign-in is completed. */
  verifier: string;
  /** Goes to the server with the request for the letter: the SHA-256 of the verifier. */
  challenge: string;
  method: 's256';
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * A fresh verifier (32 random bytes) and its SHA-256 challenge. Web Crypto hashes only in a secure context (HTTPS,
 * localhost, the native shell) — the only places the app runs. Elsewhere there is no sign-in
 * (`AccountError('unavailable')`): the «plain» method of the RFC would send the verifier itself with the request,
 * over a connection anybody can read.
 */
export async function createPkcePair(): Promise<PkcePair> {
  if (!globalThis.crypto?.subtle) throw new AccountError('unavailable');
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)), method: 's256' };
}
