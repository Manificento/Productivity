import { describe, expect, it } from 'vitest';
import { SCHULTE_SIZE, generateTable, schulteResult, startSchulte, tapSchulte } from './schulte';

describe('Schulte table', () => {
  it('Given two launches Then the table contains 1–25 exactly once and differs between launches', () => {
    let s = 1;
    const random = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const a = generateTable(random);
    const b = generateTable(random);
    const sorted = (t: number[]) => [...t].sort((x, y) => x - y);
    expect(sorted(a)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(sorted(b)).toEqual(sorted(a));
    expect(a).not.toEqual(b);
  });

  it('Given I find 1–25 in order Then time and errors are computed; a wrong tap is an error and does not advance', () => {
    let state = startSchulte(1_000);
    state = tapSchulte(state, 5, 1_100);
    expect(state).toMatchObject({ next: 1, errors: 1 });
    for (let n = 1; n <= SCHULTE_SIZE; n++) state = tapSchulte(state, n, 1_000 + n * 1_000);
    expect(schulteResult(state)).toEqual({ durationMs: 25_000, errors: 1, accuracyPct: 96 });
  });

  it('there is no result before the last number and taps after the end change nothing', () => {
    expect(schulteResult(startSchulte(0))).toBeUndefined();
    let state = startSchulte(0);
    for (let n = 1; n <= SCHULTE_SIZE; n++) state = tapSchulte(state, n, n);
    expect(tapSchulte(state, 3, 99)).toBe(state);
  });
});
