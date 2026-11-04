import { useLiveQuery } from 'dexie-react-hooks';
import { BASELINE_SETTING_KEY, DEFAULT_BASELINE } from '../../../core/adaptation/rules';
import type { Baseline } from '../../../core/adaptation/types';
import { db } from '../../../core/db';

/** The stored baseline merged over the defaults — the same way `loadDailyTargets` reads it. */
export async function loadBaseline(): Promise<Baseline> {
  const s = await db.settings.get(BASELINE_SETTING_KEY);
  return { ...DEFAULT_BASELINE, ...((s?.value as Partial<Baseline>) ?? {}) };
}

export async function saveBaseline(b: Baseline): Promise<void> {
  await db.settings.put({ key: BASELINE_SETTING_KEY, value: b });
}

/** Removes the user's baseline, so the defaults apply again. */
export async function resetBaseline(): Promise<void> {
  await db.settings.delete(BASELINE_SETTING_KEY);
}

export function useBaseline(): Baseline | undefined {
  return useLiveQuery(loadBaseline, []);
}
