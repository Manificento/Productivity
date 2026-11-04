import { afterEach, describe, expect, it } from 'vitest';
import { BASELINE_SETTING_KEY, DEFAULT_BASELINE } from '../../../core/adaptation/rules';
import { loadDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { db } from '../../../core/db';
import { loadBaseline, resetBaseline, saveBaseline } from './baseline';

afterEach(async () => {
  await db.settings.clear();
});

describe('baseline data', () => {
  it('Given экран «Базовый режим» When я меняю ёмкость дня на 300 мин и отбой на 23:00 Then сохраняется в settings под adaptation.baseline, цели обычного дня меняются', async () => {
    const changed = { ...DEFAULT_BASELINE, taskCapacityMin: 300, bedtime: '23:00' };
    await saveBaseline(changed);
    expect(await db.settings.get(BASELINE_SETTING_KEY)).toEqual({ key: 'adaptation.baseline', value: changed });
    const t = await loadDailyTargets('2026-11-04');
    expect(t.phase).toBe('normal');
    expect(t.taskCapacityMin).toBe(300);
    expect(t.bedtime).toBe('23:00');
  });

  it('Given изменённый режим When я нажимаю «Сбросить» Then возвращаются DEFAULT_BASELINE', async () => {
    await saveBaseline({ ...DEFAULT_BASELINE, taskCapacityMin: 300 });
    await resetBaseline();
    expect(await loadBaseline()).toEqual(DEFAULT_BASELINE);
    expect((await loadDailyTargets('2026-11-04')).taskCapacityMin).toBe(DEFAULT_BASELINE.taskCapacityMin);
  });

  it('fills fields missing from a stored baseline with defaults', async () => {
    await db.settings.put({ key: BASELINE_SETTING_KEY, value: { sleepHours: 8 } });
    expect(await loadBaseline()).toEqual({ ...DEFAULT_BASELINE, sleepHours: 8 });
  });
});
