import { describe, expect, it } from 'vitest';
import { nextAlarm, sleepOffer, windowLabel } from './alarm';

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();
const targets = (wakeTime: string, wakeWindowMin: number) => () => ({ wakeTime, wakeWindowMin });

describe('alarm logic', () => {
  it('Given wakeTime и wakeWindowMin When я открываю «Сон» Then окно «6:30–7:00»', () => {
    expect(windowLabel('2026-11-08', '07:00', 30)).toBe('6:30–7:00');
    expect(windowLabel('2026-11-08', '07:30', 0)).toBe('7:30–7:30');
    // A window across midnight starts the evening before.
    expect(windowLabel('2026-11-08', '00:10', 30)).toBe('23:40–0:10');
  });

  it('Given будильник включён When наступает окно Then звонит в начале окна: the next window start after now', () => {
    // Evening: tomorrow's window.
    expect(nextAlarm(at(2026, 11, 7, 22, 0), targets('07:00', 30))).toEqual({
      at: at(2026, 11, 8, 6, 30),
      wakeDay: '2026-11-08',
    });
    // Early morning before the window: today's.
    expect(nextAlarm(at(2026, 11, 8, 5, 0), targets('07:00', 30))).toEqual({
      at: at(2026, 11, 8, 6, 30),
      wakeDay: '2026-11-08',
    });
    // Inside or after today's window start: tomorrow's.
    expect(nextAlarm(at(2026, 11, 8, 6, 30), targets('07:00', 30))?.wakeDay).toBe('2026-11-09');
    // Each wake day has its own targets.
    expect(
      nextAlarm(at(2026, 11, 7, 22, 0), (day) =>
        day === '2026-11-08' ? { wakeTime: '08:00', wakeWindowMin: 20 } : undefined,
      ),
    ).toEqual({ at: at(2026, 11, 8, 7, 40), wakeDay: '2026-11-08' });
    expect(nextAlarm(at(2026, 11, 7, 22, 0), () => undefined)).toBeUndefined();
  });

  it('Given звонок When я нажимаю «Я встал» Then предложение записать сон с подставленным временем', () => {
    expect(sleepOffer({ dismissedAt: at(2026, 11, 8, 6, 34), alarmAt: at(2026, 11, 8, 6, 30) }, '23:00')).toEqual({
      wakeDay: '2026-11-08',
      bedtime: '23:00',
      wake: '06:34',
    });
  });
});
