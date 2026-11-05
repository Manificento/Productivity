import { describe, expect, it } from 'vitest';
import { breathAt, patternById } from './patterns';

describe('breathAt', () => {
  it('4-7-8: вдох, задержка, выдох по времени', () => {
    const p = patternById('4-7-8');
    expect(breathAt(p, 1000)?.label).toBe('Вдох');
    expect(breathAt(p, 5000)?.label).toBe('Задержка');
    expect(breathAt(p, 12000)?.label).toBe('Выдох');
    expect(breathAt(p, 19000)?.label).toBe('Вдох'); // цикл 19 с
  });
  it('круг растёт на вдохе и сжимается на выдохе', () => {
    const p = patternById('box');
    expect(breathAt(p, 2000)!.scale).toBeGreaterThan(breathAt(p, 0)!.scale);
    expect(breathAt(p, 10000)!.scale).toBeLessThan(breathAt(p, 8000)!.scale);
  });
  it('без паттерна — нет подсказки', () => {
    expect(breathAt(patternById('none'), 1000)).toBeNull();
  });
});
