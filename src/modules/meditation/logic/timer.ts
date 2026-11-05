import type { Millis } from '../../../core/types';

/** Remaining time from timestamps, so a throttled or hidden tab cannot drift the countdown. */
export function remainingMs(startedAt: Millis, durationMin: number, now: Millis): number {
  return Math.max(0, startedAt + durationMin * 60_000 - now);
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const MIN_SAVED_MS = 60_000;

/** An interrupted session is kept only when at least a minute passed; duration is whole minutes. */
export function interruptedMinutes(startedAt: Millis, now: Millis): number | null {
  const elapsed = now - startedAt;
  if (elapsed < MIN_SAVED_MS) return null;
  return Math.floor(elapsed / 60_000);
}
