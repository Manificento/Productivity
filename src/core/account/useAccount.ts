import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db';
import { signInBackend } from '../sync/config';
import { ACCOUNT_SESSION_KEY } from '../sync/localOnly';
import { accountStateOf, type AccountState } from './session';

/**
 * The account on this device, live: `unavailable` (the build has no cloud backend — the app is local-only),
 * `loading`, `signedOut`, `pending` (a letter was sent), `signedIn`. Reads only the device — never the network —
 * and gives no tokens: a request gets its token from `getAccessToken()`.
 */
export function useAccount(): AccountState {
  const available = signInBackend() !== null;
  const row = useLiveQuery(
    async () => (available ? ((await db.settings.get(ACCOUNT_SESSION_KEY)) ?? null) : null),
    [available],
  );
  // `available` is part of the answer: the same row means another state in a build without a backend.
  return useMemo(() => (available ? accountStateOf(row) : accountStateOf(null)), [available, row]);
}
