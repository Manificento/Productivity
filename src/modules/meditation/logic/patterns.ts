export type PatternId = '4-7-8' | 'box' | 'none';

export interface BreathPhase {
  label: string;
  seconds: number;
  /** Circle size at the end of the phase: 1 = full, 0 = small. */
  to: 0 | 1;
}

export interface BreathPattern {
  id: PatternId;
  title: string;
  phases: BreathPhase[];
}

export const PATTERNS: BreathPattern[] = [
  {
    id: '4-7-8',
    title: '4-7-8',
    phases: [
      { label: 'Вдох', seconds: 4, to: 1 },
      { label: 'Задержка', seconds: 7, to: 1 },
      { label: 'Выдох', seconds: 8, to: 0 },
    ],
  },
  {
    id: 'box',
    title: 'Коробочное 4-4-4-4',
    phases: [
      { label: 'Вдох', seconds: 4, to: 1 },
      { label: 'Задержка', seconds: 4, to: 1 },
      { label: 'Выдох', seconds: 4, to: 0 },
      { label: 'Пауза', seconds: 4, to: 0 },
    ],
  },
  { id: 'none', title: 'Без паттерна', phases: [] },
];

export const DURATIONS_MIN = [3, 5, 10, 20] as const;

export function patternById(id: PatternId): BreathPattern {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS.find((p) => p.id === 'none')!;
}

export interface BreathState {
  label: string;
  /** Circle scale 0.4..1. */
  scale: number;
}

/** Where in the breathing cycle we are after `elapsedMs`. Pattern «без паттерна» has no state. */
export function breathAt(pattern: BreathPattern, elapsedMs: number): BreathState | null {
  if (pattern.phases.length === 0) return null;
  const cycle = pattern.phases.reduce((s, p) => s + p.seconds * 1000, 0);
  let t = ((elapsedMs % cycle) + cycle) % cycle;
  let from: 0 | 1 = 0;
  for (const phase of pattern.phases) {
    const len = phase.seconds * 1000;
    if (t < len) {
      const k = t / len;
      const level = phase.to === from ? phase.to : from + (phase.to - from) * k;
      return { label: phase.label, scale: 0.4 + 0.6 * level };
    }
    t -= len;
    from = phase.to;
  }
  return null;
}
