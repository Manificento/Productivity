import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { logWeight } from './weight';

beforeEach(async () => {
  await db.weightLogs.clear();
});

describe('weight log', () => {
  it('Given ввод 400 When logWeight Then ошибка, записи нет', async () => {
    await expect(logWeight('2026-11-04', 400)).rejects.toThrow(/кг/);
    expect(await db.weightLogs.count()).toBe(0);
  });
});
