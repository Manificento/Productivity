import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { QUEST_BONUS_XP } from '../logic/quests';
import { awardQuest } from './quests';

beforeEach(async () => {
  await db.xpEvents.clear();
});

describe('awardQuest', () => {
  it('Given два одновременных вызова When квест выполнен Then бонус записан в xpEvents один раз', async () => {
    const results = await Promise.all([awardQuest('2026-11-03', 'focus'), awardQuest('2026-11-03', 'focus')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const rows = await db.xpEvents.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'quest', questId: 'focus', amount: QUEST_BONUS_XP });
  });

  it('Given другой день или другой квест When записываю Then это отдельное начисление', async () => {
    await awardQuest('2026-11-03', 'focus');
    expect(await awardQuest('2026-11-04', 'focus')).toBe(true);
    expect(await awardQuest('2026-11-03', 'bedtime')).toBe(true);
    expect(await db.xpEvents.count()).toBe(3);
  });
});
