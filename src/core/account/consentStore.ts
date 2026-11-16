import { z } from 'zod';
import { db } from '../db';
import type { BackendConfig } from '../sync/config';
import { ACCOUNT_CONSENTS_KEY } from '../sync/localOnly';
import {
  consentsAfterAnswer,
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
import { authorized, readStoredAccount } from './session';

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

/**
 * Changes the device's copy in one transaction, and only while this device is still signed in as `userId`: an answer
 * of the server may arrive after `signOut()` erased the copy, or after another user signed in here — then it is not
 * written at all (`null`). The same idea as `ifUnchanged` in `session.ts`.
 */
function changeCache<T>(userId: string, change: (known: EffectiveConsents) => Promise<T>): Promise<T | null> {
  return db.transaction('rw', db.settings, async () => {
    const account = await readStoredAccount();
    if (account?.state !== 'signedIn' || account.userId !== userId) return null;
    return change((await readCache(userId)) ?? {});
  });
}

async function fetchConsents(backend: BackendConfig, accessToken: string): Promise<EffectiveConsents> {
  // Newest first: the server gives at most 1000 rows, and the rows in force are among the newest.
  const answer = await send(backend, `/rest/v1/consents?${SELECT}&order=id.desc`, { method: 'GET', accessToken });
  if (!answer.ok) throw refusedByApi(answer);
  const rows = z.array(journalRow).safeParse(answer.body);
  if (!rows.success) throw new AccountError('server', answer.status);
  return effectiveConsents(rows.data);
}

/**
 * Asks the server for the journal and brings the device's copy up to the answer. A consent recorded while the answer
 * was on its way is kept (`consentsAfterAnswer`): the answer may be older than that row. The answer of a user who
 * is no longer signed in here is returned, but not written.
 */
async function askServer(backend: BackendConfig, accessToken: string, userId: string): Promise<EffectiveConsents> {
  const before = (await readCache(userId)) ?? {};
  const told = await fetchConsents(backend, accessToken);
  const written = await changeCache(userId, async (current) => {
    const consents = consentsAfterAnswer(before, current, told);
    await writeCache(userId, consents);
    return consents;
  });
  return written ?? told;
}

/** Reads the journal from the server and brings the device's copy of what is in force up to it. */
export async function refreshConsents(now: number = Date.now()): Promise<EffectiveConsents> {
  const { backend, accessToken, userId } = await authorized(now);
  return askServer(backend, accessToken, userId);
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
    if (!known || !isGranted(known, 'age')) known = await askServer(backend, accessToken, userId);
    if (!isGranted(known, 'age')) throw new AccountError('age_required');
  }
  const answer = await send(backend, `/rest/v1/consents?${SELECT}`, {
    method: 'POST',
    accessToken,
    headers: { Prefer: 'return=representation' },
    body: { kind, granted, text_version: textVersion, details: details ?? null },
  });
  if (!answer.ok) {
    const refused = refusedByApi(answer);
    // The copy here said the age is confirmed and the server says it is not (taken back on another device, or the
    // server lost rows): the journal corrects the copy, so the next try is refused here and the screens show it.
    if (refused.kind === 'age_required') await askServer(backend, accessToken, userId).catch(() => undefined);
    throw refused;
  }
  const stored = z.array(journalRow).length(1).safeParse(answer.body);
  if (!stored.success) throw new AccountError('server', answer.status);
  const consent = toConsent(stored.data[0]);
  const behind = await changeCache(userId, async (known) => {
    // The row just stored is the last of its kind — unless the copy already holds a later one: another tab recorded
    // the same kind at the same moment, or the server lost rows (a restored backup). Then only the journal can tell.
    const later = (known[kind]?.id ?? 0) >= consent.id;
    // …but a withdrawal the server has stored goes into the copy at once, whatever the copy held: if the journal
    // cannot be read now, the device errs on the side of «not granted» — until #279 it is the only check of the
    // cloud consent. A consent GIVEN waits for the journal: the row in the copy may be a later withdrawal.
    if (!later || !consent.granted) await writeCache(userId, { ...known, [kind]: consent });
    return later;
  });
  // The consent is stored either way; without the network the copy catches up at the next `refreshConsents()`.
  if (behind) await askServer(backend, accessToken, userId).catch(() => undefined);
  return consent;
}
