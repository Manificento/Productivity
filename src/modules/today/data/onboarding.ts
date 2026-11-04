import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';

/** `settings` key (owned by today, `adaptation.*`): the first-run onboarding was finished or skipped. */
export const ONBOARDING_DONE_KEY = 'adaptation.onboardingDone';

/** First run: no events and onboarding not finished yet. `undefined` while loading. */
export function useNeedsOnboarding(): boolean | undefined {
  return useLiveQuery(async () => {
    const [done, events] = await Promise.all([db.settings.get(ONBOARDING_DONE_KEY), db.lifeEvents.count()]);
    return done?.value !== true && events === 0;
  }, []);
}

export async function finishOnboarding(): Promise<void> {
  await db.settings.put({ key: ONBOARDING_DONE_KEY, value: true });
}
