import { describe, expect, it } from 'vitest';
import { msUntilNextDay } from './day';

// Tests run in Asia/Almaty (no daylight saving), so 23/25-hour days are not exercised here;
// date-fns startOfDay/addDays work in local calendar days, which handles them.
describe('msUntilNextDay', () => {
  it('counts to the next local midnight', () => {
    expect(msUntilNextDay(new Date(2026, 10, 4, 23, 59, 0).getTime())).toBe(60_000);
    expect(msUntilNextDay(new Date(2026, 10, 4, 0, 0, 0).getTime())).toBe(24 * 60 * 60_000);
  });
});
