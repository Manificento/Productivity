import { describe, expect, it } from 'vitest';
import { formatCapacity } from './preview';

describe('formatCapacity', () => {
  it.each([
    [360, '6 ч'],
    [210, '3,5 ч'],
    [105, '1,8 ч'],
    [350, '5,8 ч'],
    [45, '45 мин'],
    [0, '0'],
  ])('%i → %s', (min, label) => {
    expect(formatCapacity(min)).toBe(label);
  });
});
