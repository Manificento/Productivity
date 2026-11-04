import { describe, expect, it } from 'vitest';
import { pickStarter, STARTER_HABITS } from './starter';

describe('starter habits', () => {
  it('предложение: Медитация, Чтение 20 мин, Английский, Тренировка, Отбой вовремя', () => {
    expect(STARTER_HABITS.map((h) => h.name)).toEqual([
      'Медитация',
      'Чтение 20 мин',
      'Английский',
      'Тренировка',
      'Отбой вовремя',
    ]);
  });

  it('выбранные — в порядке предложения, лишние имена игнорируются', () => {
    expect(pickStarter(new Set(['Отбой вовремя', 'Медитация', 'Йога'])).map((h) => h.name)).toEqual([
      'Медитация',
      'Отбой вовремя',
    ]);
    expect(pickStarter(new Set())).toEqual([]);
  });
});
