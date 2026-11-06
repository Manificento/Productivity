/** Stroop test as pure functions: name the INK colour of a colour word, ignoring what the word says. */

export const STROOP_DURATION_MS = 60_000;
/** Share of trials where the word names its own ink colour. */
const CONGRUENT_RATE = 0.35;

export const STROOP_COLORS = [
  { id: 'red', name: 'Красный', ink: 'text-red-600 dark:text-red-400' },
  { id: 'blue', name: 'Синий', ink: 'text-blue-600 dark:text-blue-400' },
  { id: 'green', name: 'Зелёный', ink: 'text-green-600 dark:text-green-400' },
  { id: 'yellow', name: 'Жёлтый', ink: 'text-yellow-500 dark:text-yellow-300' },
] as const;

export type StroopColorId = (typeof STROOP_COLORS)[number]['id'];

export interface StroopTrial {
  /** The colour the word names. */
  word: StroopColorId;
  /** The colour it is printed in — the right answer. */
  ink: StroopColorId;
}

export function isCongruent(trial: StroopTrial): boolean {
  return trial.word === trial.ink;
}

/** `random` returns [0, 1) like Math.random. */
export function generateStroopTrial(random: () => number = Math.random): StroopTrial {
  const ids = STROOP_COLORS.map((c) => c.id);
  const ink = ids[Math.floor(random() * ids.length)];
  if (random() < CONGRUENT_RATE) return { word: ink, ink };
  const others = ids.filter((id) => id !== ink);
  return { word: others[Math.floor(random() * others.length)], ink };
}

export interface StroopAnswer {
  congruent: boolean;
  correct: boolean;
  rtMs: number;
}

export interface StroopScore {
  accuracyPct: number;
  /** Mean RT of correct answers; undefined without any. */
  meanRtMs?: number;
  errors: number;
  /** Mean RT of correct incongruent answers minus that of congruent ones; undefined if either group is empty. */
  interferenceMs?: number;
  trials: number;
}

function mean(values: number[]): number | undefined {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

export function scoreStroop(answers: StroopAnswer[]): StroopScore {
  const correct = answers.filter((a) => a.correct);
  const meanAll = mean(correct.map((a) => a.rtMs));
  const congruent = mean(correct.filter((a) => a.congruent).map((a) => a.rtMs));
  const incongruent = mean(correct.filter((a) => !a.congruent).map((a) => a.rtMs));
  return {
    accuracyPct: answers.length ? Math.round((correct.length / answers.length) * 100) : 0,
    meanRtMs: meanAll === undefined ? undefined : Math.round(meanAll),
    errors: answers.length - correct.length,
    interferenceMs:
      congruent === undefined || incongruent === undefined ? undefined : Math.round(incongruent - congruent),
    trials: answers.length,
  };
}

/** `?duration=<s>` (1–60) only in test mode. */
export function parseStroopDurationParam(param: string | null, testMode: boolean): number {
  if (!testMode || param === null) return STROOP_DURATION_MS;
  const seconds = Number(param);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > STROOP_DURATION_MS / 1_000) return STROOP_DURATION_MS;
  return seconds * 1_000;
}
