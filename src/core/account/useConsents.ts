import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db';
import { signInBackend } from '../sync/config';
import { ACCOUNT_CONSENTS_KEY, ACCOUNT_SESSION_KEY } from '../sync/localOnly';
import { consentsOf, isGranted, type ConsentKind, type EffectiveConsents } from './consents';
import { accountStateOf } from './session';

export interface ConsentsState {
  /**
   * `unavailable` — the build has no cloud backend; `signedOut` — no account on this device; `loading`;
   * `unknown` — signed in, but the journal has not been read from the server yet (`refreshConsents()`);
   * `ready` — `consents` is what the server last told.
   */
  status: 'unavailable' | 'loading' | 'signedOut' | 'unknown' | 'ready';
  /** The consent in force per kind — the last row of the journal of that kind; empty unless `ready`. */
  consents: EffectiveConsents;
  /** Whether the consent is in force. Anything but a known «granted» is `false` — nothing leaves by default. */
  isGranted: (kind: ConsentKind) => boolean;
}

const NONE: EffectiveConsents = {};

/**
 * The signed-in user's consents, live and readable offline: the copy on the device (`settings`
 * `account.consents`), which `recordConsent()` and `refreshConsents()` keep up to date. Never asks the network.
 */
export function useConsents(): ConsentsState {
  const available = signInBackend() !== null;
  const rows = useLiveQuery(
    async () => (available ? db.settings.bulkGet([ACCOUNT_SESSION_KEY, ACCOUNT_CONSENTS_KEY]) : []),
    [available],
  );
  return useMemo(() => {
    const account = accountStateOf(rows && (rows[0] ?? null));
    const cached = account.status === 'signedIn' ? consentsOf(rows?.[1]?.value, account.userId) : null;
    const status =
      account.status === 'signedIn'
        ? cached
          ? 'ready'
          : 'unknown'
        : account.status === 'pending'
          ? 'signedOut'
          : account.status;
    const consents = cached ?? NONE;
    return { status, consents, isGranted: (kind: ConsentKind) => isGranted(consents, kind) };
  }, [rows]);
}
