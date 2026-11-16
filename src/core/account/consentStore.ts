import { z } from 'zod';
import { db } from '../db';
import type { BackendConfig } from '../sync/config';
import { ACCOUNT_CONSENTS_KEY } from '../sync/localOnly';
import {
  consentsOf,
  effectiveConsents,
  isGranted,
  journalRow,
  toConsent,
  type CachedConsents,
  type Consent,
  type ConsentDetails,
  type ConsentKind,
  type EffectiveConsents,
} from './consents';
import { AccountError } from './errors';
import { commonFailure, errorField, send, type Answer } from './http';
import { authorized } from './session';

/**
 * The consent journal over the network and its copy on the device.
 *
 * The journal lives on the server (`/rest/v1/consents`); what is in force is cached in `settings`
 * (`account.consents`, device state) so that the app can read it offline — `useConsents()` reads only the cache.
 * A consent is given or taken back only online: it counts from the moment the server stored its row.
 */

const SELECT = 'select=id,kind,granted,text_version,details,created_at';

/** A request the API refused. The server says «confirm the age first» with `details: age_required`. */
export function refusedByApi(answer: Answer): AccountError {
  const common = commonFailure(answer);
  if (common) return common;
  if (answer.status === 401) return new AccountError('session_expired', 401);
  if (errorField(answer.body, 'details') === 'age_required') return new AccountError('age_required', answer.status);
  return new AccountError('server', answer.status);
}

async function readCache(userId: string): Promise<EffectiveConsents | null> {
  return consentsOf((await db.settings.get(ACCOUNT_CONSENTS_KEY))?.value, userId);
}

async function writeCache(userId: string, consents: EffectiveConsents): Promise<void> {
  const value: CachedConsents = { userId, consents };
  await db.settings.put({ key: ACCOUNT_CONSENTS_KEY, value });
}

async function fetchConsents(backend: BackendConfig, accessToken: string): Promise<EffectiveConsents> {
  // Newest first: the server gives at most 1000 rows, and the rows in force are among the newest.
  const answer = await send(backend, `/rest/v1/consents?${SELECT}&order=id.desc`, { method: 'GET', accessToken });
  if (!answer.ok) throw refusedByApi(answer);
  const rows = z.array(journalRow).safeParse(answer.body);
  if (!rows.success) throw new AccountError('server', answer.status);
  return effectiveConsents(rows.data);
}

/** Reads the journal from the server and replaces the device's copy of what is in force. */
export async function refreshConsents(now: number = Date.now()): Promise<EffectiveConsents> {
  const { backend, accessToken, userId } = await authorized(now);
  const consents = await fetchConsents(backend, accessToken);
  await writeCache(userId, consents);
  return consents;
}

/**
 * Adds a row to the journal: `granted: true` gives the consent, `granted: false` takes it back — never an edit of
 * an earlier row. `textVersion` — the version of the text the user saw. For `age` pass
 * `details: { rule: AgeRule }`: the rule is all the server learns, the year of birth is never sent.
 *
 * The age comes first (ADR-0009, design p. 6): until it is confirmed, no other consent can be given — the device
 * checks it before asking and the server checks it again (`AccountError('age_required')` either way). Taking a
 * consent back is always possible.
 */
export async function recordConsent(
  kind: ConsentKind,
  granted: boolean,
  textVersion: string,
  details?: ConsentDetails,
  now: number = Date.now(),
): Promise<Consent> {
  const { backend, accessToken, userId } = await authorized(now);
  if (granted && kind !== 'age') {
    // The copy on the device may be behind another device: ask the server before saying no.
    let known = await readCache(userId);
    if (!known || !isGranted(known, 'age')) {
      known = await fetchConsents(backend, accessToken);
      await writeCache(userId, known);
    }
    if (!isGranted(known, 'age')) throw new AccountError('age_required');
  }
  const answer = await send(backend, `/rest/v1/consents?${SELECT}`, {
    method: 'POST',
    accessToken,
    headers: { Prefer: 'return=representation' },
    body: { kind, granted, text_version: textVersion, details: details ?? null },
  });
  if (!answer.ok) throw refusedByApi(answer);
  const stored = z.array(journalRow).length(1).safeParse(answer.body);
  if (!stored.success) throw new AccountError('server', answer.status);
  const consent = toConsent(stored.data[0]);
  await db.transaction('rw', db.settings, async () => {
    await writeCache(userId, { ...(await readCache(userId)), [kind]: consent });
  });
  return consent;
}
