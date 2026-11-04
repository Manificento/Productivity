import { describe, expect, it } from 'vitest';
import type { Task } from '../../../core/types';
import { completedOn, validateTitle } from './tasks';

function task(over: Partial<Task>): Task {
  return { id: 'x', createdAt: 0, updatedAt: 0, title: 't', priority: 4, tags: [], ...over };
}

// 2026-11-04 in Asia/Almaty (UTC+5) — the zone the tests run in.
const NOV4_0030_LOCAL = new Date(2026, 10, 4, 0, 30).getTime();
const NOV3_2330_LOCAL = new Date(2026, 10, 3, 23, 30).getTime();

describe('validateTitle', () => {
  it('Given пустое название When я нажимаю «Добавить» Then задача не создаётся, поле показывает ошибку', () => {
    expect(validateTitle('')).toBe('Введите название задачи');
    expect(validateTitle('   ')).toBe('Введите название задачи');
  });

  it('accepts a non-empty title', () => {
    expect(validateTitle('Купить молоко')).toBeUndefined();
  });
});

describe('completedOn', () => {
  it('returns tasks completed on the given local day, latest first', () => {
    const list = [
      task({ id: 'early', completedAt: NOV4_0030_LOCAL }),
      task({ id: 'late', completedAt: NOV4_0030_LOCAL + 60_000 }),
      task({ id: 'yesterday', completedAt: NOV3_2330_LOCAL }),
      task({ id: 'open' }),
    ];
    expect(completedOn(list, '2026-11-04').map((t) => t.id)).toEqual(['late', 'early']);
  });
});
