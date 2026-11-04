import { configure } from '@testing-library/react';

/**
 * How long `findBy*` / `waitFor` wait for a live query to settle. The default 1 s is too short for a full
 * screen (several Dexie live queries) when the test run is loaded with parallel workers (#169, #90).
 */
export const ASYNC_TIMEOUT_MS = 3000; // below Vitest's 5 s test timeout, so a miss still prints the DOM

/** Call at the top of a test file whose screens read the DB through live queries. */
export function applyAsyncTimeout(): void {
  configure({ asyncUtilTimeout: ASYNC_TIMEOUT_MS });
}
