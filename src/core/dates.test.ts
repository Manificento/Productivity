import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { msUntilNextDay, useTodayKey } from './dates';

afterEach(() => {
  vi.useRealTimers();
});

// Tests run in Asia/Almaty (no daylight saving), so 23/25-hour days are not exercised here;
// date-fns startOfDay/addDays work in local calendar days, which handles them.
describe('msUntilNextDay', () => {
  it('counts to the next local midnight', () => {
    expect(msUntilNextDay(new Date(2026, 10, 4, 23, 59, 0).getTime())).toBe(60_000);
    expect(msUntilNextDay(new Date(2026, 10, 4, 0, 0, 0).getTime())).toBe(24 * 60 * 60_000);
  });
});

describe('useTodayKey', () => {
  it('Given страница открыта через полночь When наступает новый день Then useTodayKey() возвращает новый DateKey без перезагрузки', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 23, 59, 0));
    const { result } = renderHook(() => useTodayKey());
    expect(result.current).toBe('2026-11-04');

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe('2026-11-05');
  });

  it('re-arms its timer when the day did not change (clock moved back)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 23, 59, 0));
    const { result } = renderHook(() => useTodayKey());
    act(() => {
      vi.setSystemTime(new Date(2026, 10, 4, 22, 0, 0)); // clock corrected backwards
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe('2026-11-04');
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60_000);
    });
    expect(result.current).toBe('2026-11-05');
  });

  it('re-checks the day when the app comes back to the foreground (timers sleep on phones)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 10, 0));
    const { result } = renderHook(() => useTodayKey());
    vi.setSystemTime(new Date(2026, 10, 5, 8, 0));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe('2026-11-05');
  });
});
