import { z } from 'zod';

/**
 * The consent journal (ADR-0009, design p. 2 and 6), as the client sees it. Pure: no network, no Dexie.
 *
 * The server keeps an append-only journal (`public.consents`, `infra/supabase/migrations/`): giving a consent and
 * taking it back are both NEW rows, nothing is ever changed or removed. The consent in force is the LAST row of
 * its kind.
 */

/**
 * - `cloud` — the cloud copy and the sync of the user's data;
 * - `cloud_health` — health data inside that copy (`HEALTH_TABLES` in `core/sync/healthData.ts`): a separate,
 *   explicit consent (GDPR art. 9, WA MHMDA);
 * - `analytics` — first-party analytics and models on pseudonymised data;
 * - `third_party` — any transfer to a third party (none today);
 * - `age` — the user confirmed the age the cloud account needs; `details.rule` says by which rule.
 */
export const CONSENT_KINDS = ['cloud', 'cloud_health', 'analytics', 'third_party', 'age'] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

/**
 * The rule by which the age was confirmed — all the server ever learns about it; the year of birth and the
 * country stay on the device (the settings screen applies the rule, #283):
 * `16+` — 16 or older, outside Kazakhstan; `kz18+` — 18 or older, in Kazakhstan; `kz_guardian` — 16–17 in
 * Kazakhstan with the consent of a legal representative.
 */
export const AGE_RULES = ['16+', 'kz18+', 'kz_guardian'] as const;

export type AgeRule = (typeof AGE_RULES)[number];

export type ConsentDetails = Record<string, unknown>;

/** One row of the journal. */
export interface Consent {
  /** Number of the row: the server numbers the rows in the order it stored them — the greater, the later. */
  id: number;
  kind: ConsentKind;
  granted: boolean;
  /** Version of the text the user saw (the texts live in the settings module). */
  textVersion: string;
  /** For `age` — `{ rule: AgeRule }`. */
  details: ConsentDetails | null;
  /** Server time of the row, ISO 8601. */
  createdAt: string;
}

/** The consent in force per kind; a kind that was never answered is absent. */
export type EffectiveConsents = Partial<Record<ConsentKind, Consent>>;

/** A row as the API answers it. */
export const journalRow = z.object({
  id: z.number(),
  kind: z.enum(CONSENT_KINDS),
  granted: z.boolean(),
  text_version: z.string(),
  details: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});

export type JournalRow = z.infer<typeof journalRow>;

export function toConsent(row: JournalRow): Consent {
  return {
    id: row.id,
    kind: row.kind,
    granted: row.granted,
    textVersion: row.text_version,
    details: row.details,
    createdAt: row.created_at,
  };
}

/**
 * The consents in force: of every kind, the last row of the journal. «Last» is the row with the greatest `id` —
 * the server numbers the rows in the order it stored them (two rows of one request share `created_at`).
 */
export function effectiveConsents(rows: readonly JournalRow[]): EffectiveConsents {
  const last = new Map<ConsentKind, JournalRow>();
  for (const row of rows) {
    const known = last.get(row.kind);
    if (!known || row.id > known.id) last.set(row.kind, row);
  }
  const effective: EffectiveConsents = {};
  for (const [kind, row] of last) effective[kind] = toConsent(row);
  return effective;
}

/**
 * The device's copy of what is in force after the server answered `told` — the journal as it was at some moment
 * WHILE the device was asking. `before` is the copy when the question was sent, `current` the copy now.
 *
 * The answer replaces the copy, with one exception: a consent recorded while the answer was on its way (here or in
 * another tab — its row in `current` is not the one of `before`) may be later than what the answer knows. Of those
 * two rows the later one of the journal — the greater `id` — stays, so an old answer never undoes a new consent
 * or a new withdrawal.
 */
export function consentsAfterAnswer(
  before: EffectiveConsents,
  current: EffectiveConsents,
  told: EffectiveConsents,
): EffectiveConsents {
  const consents: EffectiveConsents = { ...told };
  for (const kind of CONSENT_KINDS) {
    const recorded = current[kind];
    if (recorded && recorded.id !== before[kind]?.id && recorded.id > (told[kind]?.id ?? 0)) {
      consents[kind] = recorded;
    }
  }
  return consents;
}

/** Whether a consent is in force: its last row says «granted». Never answered or taken back — no. */
export function isGranted(consents: EffectiveConsents, kind: ConsentKind): boolean {
  return consents[kind]?.granted === true;
}

/** What the device remembers of the journal (`settings` `account.consents`): whose it is and what is in force. */
export const cachedConsents = z.object({
  userId: z.string(),
  consents: z.partialRecord(
    z.enum(CONSENT_KINDS),
    z.object({
      id: z.number(),
      kind: z.enum(CONSENT_KINDS),
      granted: z.boolean(),
      textVersion: z.string(),
      details: z.record(z.string(), z.unknown()).nullable(),
      createdAt: z.string(),
    }),
  ),
});

export type CachedConsents = z.infer<typeof cachedConsents>;

/** The cached consents of `userId`; `null` when the device has none for this user. */
export function consentsOf(cached: unknown, userId: string): EffectiveConsents | null {
  const parsed = cachedConsents.safeParse(cached).data;
  return parsed?.userId === userId ? parsed.consents : null;
}
