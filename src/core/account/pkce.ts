/**
 * PKCE (RFC 7636) for the link of the sign-in letter: the device keeps a random `verifier` and sends its hash with
 * the request for the letter; the `?code=` of the link is worth a session only together with the verifier — so a
 * link opened on another device, or read by somebody else, signs nobody in.
 */

export interface PkcePair {
  /** Stays on this device until the sign-in is completed. */
  verifier: string;
  /** Goes to the server with the request for the letter. */
  challenge: string;
  method: 's256' | 'plain';
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * A fresh verifier (32 random bytes) and its SHA-256 challenge. Web Crypto hashes only in a secure context (HTTPS,
 * localhost, the native shell); elsewhere the challenge is the verifier itself (`plain`), which the server accepts.
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  if (!crypto.subtle) return { verifier, challenge: verifier, method: 'plain' };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)), method: 's256' };
}
