/**
 * What counts as HEALTH DATA in the cloud copy (ADR-0009, «Данные о здоровье»; contract #278) — the one list the
 * consent `cloud_health` is about. A row of these tables, and a setting with one of these prefixes, leaves the
 * device only while the user's consent `cloud_health` is in force (`core/account/`); the sync engine and the
 * server check it against this list (#279).
 *
 * Health: sleep, check-ins, nutrition, weight, workouts and programs, attention tests, mind trainers, meditation,
 * habits and their marks, experience. Not health: projects, tasks, time, events, notes, the other settings.
 *
 * A new synced table is put on one of the two sides in `healthData.test.ts`, by a `type:contract` issue.
 */
export const HEALTH_TABLES = [
  'habits',
  'habitLogs',
  'sleepLogs',
  'foods',
  'mealLogs',
  'workoutLogs',
  'checkIns',
  'cognitiveTests',
  'weightLogs',
  'programs',
  'plannedSessions',
  'meditationSessions',
  'mindSessions',
  'xpEvents',
] as const;

export type HealthTable = (typeof HEALTH_TABLES)[number];

/** `settings` keys that are health data: the alarm and the import of the health block, the nutrition profile. */
export const HEALTH_SETTING_PREFIXES = ['health.', 'nutrition.'] as const;

const SETTINGS = 'settings';
const HEALTH = new Set<string>(HEALTH_TABLES);

/** Whether a row is health data: any row of a health table, or a setting whose key has a health prefix. */
export function isHealthData(table: string, key: unknown): boolean {
  if (HEALTH.has(table)) return true;
  return (
    table === SETTINGS && typeof key === 'string' && HEALTH_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}
