import { describe, expect, it } from 'vitest';
import { buildInsights, describeCorrelation, MIN_POINTS, pearson, type InsightInput } from './insights';

describe('pearson', () => {
  it('is 1 for a perfect positive line and −1 for a perfect negative one', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });

  it('matches a known textbook value', () => {
    // x = 1..5, y = 2,4,5,4,5 → r ≈ 0.7746
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(0.7746, 4);
  });

  it('treats sleep that never changes as no spread despite float rounding', () => {
    const h = 7 + 1 / 3; // 7 h 20 min
    expect(pearson(Array(7).fill(h), [1, 2, 3, 4, 5, 6, 7])).toBeUndefined();
  });

  it('is undefined without spread or with fewer than two points', () => {
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeUndefined();
    expect(pearson([1], [1])).toBeUndefined();
  });
});

describe('describeCorrelation', () => {
  it.each([
    [0.05, 'Связи почти нет'],
    [0.2, 'Слабая положительная связь'],
    [-0.4, 'Умеренная отрицательная связь'],
    [0.75, 'Сильная положительная связь'],
  ])('%f → %s', (r, text) => {
    expect(describeCorrelation(r)).toBe(text);
  });
});

/** n days of data ending on 2026-11-30. */
function days(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `2026-11-${String(30 - n + 1 + i).padStart(2, '0')}`);
}

const TODAY = '2026-12-01';

function input(over: Partial<InsightInput> = {}): InsightInput {
  return { sleep: {}, tasksDone: {}, focusMin: {}, workoutMin: {}, energy: {}, ...over };
}

describe('buildInsights', () => {
  it('does not count today’s unfinished day', () => {
    const d = days(7);
    const sleep = { ...Object.fromEntries(d.map((k, i) => [k, 6 + i])), [TODAY]: 9 };
    const [first, focus] = buildInsights(input({ sleep }), TODAY);
    expect(first.points.map((p) => p.date)).toEqual(d);
    expect(focus.points.some((p) => p.date === TODAY)).toBe(false);
  });

  it('Given ≥ 7 дней данных When я открываю «Инсайты» Then вижу связь «сон ↔ выполненные задачи следующего дня» с коэффициентом Пирсона', () => {
    const d = days(7);
    const sleep = Object.fromEntries(d.map((k, i) => [k, 6 + i * 0.5]));
    const tasksDone = Object.fromEntries(d.map((k, i) => [k, 2 + i]));
    const [first] = buildInsights(input({ sleep, tasksDone }), TODAY);
    expect(first.id).toBe('sleep-tasks');
    expect(first.title).toBe('Сон ↔ выполненные задачи следующего дня');
    expect(first.points).toHaveLength(7);
    expect(first.r).toBeCloseTo(1);
    expect(first.missing).toBe(0);
  });

  it('counts a day with sleep but no completed tasks as zero tasks', () => {
    const d = days(7);
    const sleep = Object.fromEntries(d.map((k) => [k, 7]));
    const [first] = buildInsights(input({ sleep, tasksDone: { [d[0]]: 3 } }), TODAY);
    expect(first.points.map((p) => p.y)).toEqual([3, 0, 0, 0, 0, 0, 0]);
  });

  it('Given то же When экран открыт Then есть пары «сон ↔ фокус-минуты» и «тренировка ↔ энергия»', () => {
    const d = days(8);
    const sleep = Object.fromEntries(d.map((k, i) => [k, 6 + (i % 3)]));
    const focusMin = Object.fromEntries(d.map((k, i) => [k, 25 * (i % 3)]));
    // Workout on day D, energy at the check-in of day D + 1.
    const workoutMin = { [d[0]]: 60, [d[2]]: 30 };
    const energy = Object.fromEntries(d.slice(1).map((k, i) => [k, (i % 2) + 3]));
    const insights = buildInsights(input({ sleep, focusMin, workoutMin, energy }), TODAY);
    expect(insights.map((i) => i.id)).toEqual(['sleep-tasks', 'sleep-focus', 'workout-energy']);
    const focus = insights[1];
    expect(focus.title).toBe('Сон ↔ фокус-минуты');
    expect(focus.r).toBeCloseTo(1);
    const workout = insights[2];
    expect(workout.title).toBe('Тренировка ↔ энергия на следующее утро');
    expect(workout.points).toHaveLength(7);
    expect(workout.points[0]).toEqual({ date: d[0], x: 60, y: 3 });
    expect(workout.points[1]).toEqual({ date: d[1], x: 0, y: 4 });
  });

  it('Given < 7 точек When экран открыт Then «Мало данных — нужно ещё N дней»', () => {
    const d = days(4);
    const sleep = Object.fromEntries(d.map((k) => [k, 7]));
    const [first] = buildInsights(input({ sleep }), TODAY);
    expect(MIN_POINTS).toBe(7);
    expect(first.missing).toBe(3);
    expect(first.r).toBeUndefined();
  });
});
