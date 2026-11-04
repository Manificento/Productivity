import { describe, expect, it } from 'vitest';
import type { SleepLog } from '../../../core/types';
import { isMorningOpen, morningSteps, parseMorningSleep, readSkipped, suggestSleep, withSkipped } from './morning';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const NOW = at(4, 7, 45);
const log = (bed: number, wake: number, quality = 4): SleepLog => ({
  id: 's',
  date: '2026-11-03',
  bedtime: bed,
  wakeTime: wake,
  quality,
  createdAt: 0,
  updatedAt: 0,
});

describe('suggestSleep', () => {
  it('suggests «лёг 23:30 / встал 07:30» without history', () => {
    expect(suggestSleep(undefined, '23:30', NOW)).toEqual({ bedtime: '23:30', wake: '07:30', quality: 3 });
  });

  it('follows the bedtime of the user’s baseline', () => {
    expect(suggestSleep(undefined, '23:00', NOW).bedtime).toBe('23:00');
  });

  it('repeats the clock times and quality of the last logged night', () => {
    expect(suggestSleep(log(at(2, 0, 15), at(2, 7, 45), 5), '23:30', NOW)).toEqual({
      bedtime: '00:15',
      wake: '07:45',
      quality: 5,
    });
  });
});

describe('time of day', () => {
  it('opens the morning at 04:00', () => {
    expect(isMorningOpen(at(4, 0, 30))).toBe(false);
    expect(isMorningOpen(at(4, 3, 59))).toBe(false);
    expect(isMorningOpen(at(4, 4, 0))).toBe(true);
  });

  it('never suggests a wake-up later than now', () => {
    expect(suggestSleep(undefined, '23:30', at(4, 6, 52)).wake).toBe('06:50');
  });

  it('rejects a wake-up that has not happened yet', () => {
    expect(parseMorningSleep('2026-11-04', { bedtime: '23:30', wake: '07:30', quality: 3 }, at(4, 6, 50))).toEqual({
      ok: false,
      error: 'Время подъёма ещё не наступило',
    });
  });
});

describe('parseMorningSleep', () => {
  it('turns clock times into the night that ended this morning', () => {
    expect(parseMorningSleep('2026-11-04', { bedtime: '23:30', wake: '07:30', quality: 3 }, NOW)).toEqual({
      ok: true,
      input: { bedtime: at(3, 23, 30), wakeTime: at(4, 7, 30), quality: 3 },
    });
  });

  it('reports invalid input in Russian', () => {
    expect(parseMorningSleep('2026-11-04', { bedtime: '', wake: '07:30', quality: 3 }, NOW)).toEqual({
      ok: false,
      error: 'Укажите время отбоя и подъёма',
    });
    expect(parseMorningSleep('2026-11-04', { bedtime: '23:30', wake: '7:30', quality: 3 }, NOW).ok).toBe(false);
  });
});

describe('morning steps', () => {
  it('lists сон → самочувствие → тест with their state', () => {
    const s = morningSteps({ sleep: true, checkIn: false, test: false }, ['test']);
    expect(s.steps).toEqual([
      { step: 'sleep', state: 'done' },
      { step: 'checkIn', state: 'pending' },
      { step: 'test', state: 'skipped' },
    ]);
    expect(s.complete).toBe(false);
  });

  it('is complete when every step is done or skipped', () => {
    expect(morningSteps({ sleep: true, checkIn: true, test: false }, ['test']).complete).toBe(true);
    expect(morningSteps({ sleep: false, checkIn: false, test: false }, ['sleep', 'checkIn', 'test']).complete).toBe(
      true,
    );
  });

  it('keeps skips for today only', () => {
    expect(readSkipped({ date: '2026-11-04', skipped: ['test'] }, '2026-11-04')).toEqual(['test']);
    expect(readSkipped({ date: '2026-11-03', skipped: ['test'] }, '2026-11-04')).toEqual([]);
    expect(readSkipped(undefined, '2026-11-04')).toEqual([]);
    expect(readSkipped({ date: '2026-11-04', skipped: ['bogus', 'sleep'] }, '2026-11-04')).toEqual(['sleep']);
  });

  it('adds a skip without duplicates and starts a new day fresh', () => {
    expect(withSkipped({ date: '2026-11-04', skipped: ['test'] }, '2026-11-04', 'test')).toEqual({
      date: '2026-11-04',
      skipped: ['test'],
    });
    expect(withSkipped({ date: '2026-11-03', skipped: ['test'] }, '2026-11-04', 'sleep')).toEqual({
      date: '2026-11-04',
      skipped: ['sleep'],
    });
  });
});
