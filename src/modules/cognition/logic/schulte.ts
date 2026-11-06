/** Schulte table 5×5: find 1…25 in order as fast as possible. Pure state machine; time comes from the caller. */

export const SCHULTE_SIZE = 25;

/** A fresh random table (Fisher–Yates). `random` returns [0, 1) like Math.random. */
export function generateTable(random: () => number = Math.random): number[] {
  const cells = Array.from({ length: SCHULTE_SIZE }, (_, i) => i + 1);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

export interface SchulteState {
  /** The number to find now (SCHULTE_SIZE + 1 when finished). */
  next: number;
  errors: number;
  startedAt: number;
  finishedAt?: number;
}

export function startSchulte(now: number): SchulteState {
  return { next: 1, errors: 0, startedAt: now };
}

export function tapSchulte(state: SchulteState, tapped: number, now: number): SchulteState {
  if (state.finishedAt !== undefined) return state;
  if (tapped !== state.next) return { ...state, errors: state.errors + 1 };
  const next = state.next + 1;
  return { ...state, next, finishedAt: next > SCHULTE_SIZE ? now : undefined };
}

export interface SchulteResult {
  durationMs: number;
  errors: number;
  /** 0–100: correct taps over all taps. */
  accuracyPct: number;
}

export function schulteResult(state: SchulteState): SchulteResult | undefined {
  if (state.finishedAt === undefined) return undefined;
  return {
    durationMs: Math.round(state.finishedAt - state.startedAt),
    errors: state.errors,
    accuracyPct: Math.round((SCHULTE_SIZE / (SCHULTE_SIZE + state.errors)) * 100),
  };
}
