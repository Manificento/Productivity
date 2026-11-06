import { describe, expect, it } from 'vitest';
import { planMindTraining, planProgress } from './plan';

describe('mind-training plan', () => {
  it('Given mindTrainingMin = 10 Then the plan is n-back 5 min and Stroop 5 min', () => {
    expect(planMindTraining({ mindTrainingMin: 10, deload: false, reasons: [] })).toEqual({
      kind: 'plan',
      totalMin: 10,
      light: false,
      items: [
        { kind: 'nback', min: 5 },
        { kind: 'stroop', min: 5 },
      ],
    });
  });

  it('odd minutes give the larger half to n-back; a single minute is n-back only', () => {
    const plan = planMindTraining({ mindTrainingMin: 7, deload: false, reasons: [] });
    expect(plan).toMatchObject({
      items: [
        { kind: 'nback', min: 4 },
        { kind: 'stroop', min: 3 },
      ],
    });
    expect(planMindTraining({ mindTrainingMin: 1, deload: false, reasons: [] })).toMatchObject({
      items: [{ kind: 'nback', min: 1 }],
    });
  });

  it('Given mindTrainingMin = 0 Then no trainers, with the cause from the reasons', () => {
    expect(
      planMindTraining({
        mindTrainingMin: 0,
        deload: false,
        reasons: ['Недосып', 'Низкая энергия в чек-ине: нагрузка −20%, без тренажёров ума'],
      }),
    ).toEqual({ kind: 'none', cause: 'низкая энергия в чек-ине' });
    expect(planMindTraining({ mindTrainingMin: 0, deload: false, reasons: [] })).toEqual({
      kind: 'none',
      cause: undefined,
    });
  });

  it('Given a taper/deload day Then only one light session of ≤ 5 min', () => {
    expect(planMindTraining({ mindTrainingMin: 5, deload: true, reasons: [] })).toEqual({
      kind: 'plan',
      totalMin: 5,
      light: true,
      items: [{ kind: 'stroop', min: 5 }],
    });
    expect(planMindTraining({ mindTrainingMin: 12, deload: true, reasons: [] })).toMatchObject({ totalMin: 5 });
  });

  it('Given the sessions are done Then the plan is closed with the minutes done', () => {
    expect(planProgress(10, [180_000, 60_000])).toEqual({ doneMin: 4, closed: false });
    expect(planProgress(10, [180_000, 420_000])).toEqual({ doneMin: 10, closed: true });
    expect(planProgress(0, [60_000]).closed).toBe(false);
  });
});
