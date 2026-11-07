import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test('Given пустая база When я открываю «Прогресс» Then уровень 1, подсказка про опыт, без горизонтального скролла', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto('/#/progress');
  await expect(page.getByRole('heading', { name: 'Прогресс', level: 1 })).toBeVisible();
  await expect(page.getByTestId('level')).toHaveText('1');
  await expect(page.getByText('Пока нет опыта. Он начисляется за:')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Given пустая база When я открываю «Навыки» и «Квесты» Then шесть навыков и три квеста, без горизонтального скролла', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto('/#/progress');
  await page.getByRole('radio', { name: 'Навыки' }).click();
  await expect(page.getByRole('list', { name: 'Навыки' }).getByRole('listitem')).toHaveCount(6);
  await page.getByRole('radio', { name: 'Квесты' }).click();
  await expect(page.getByRole('list', { name: 'Квесты дня' }).getByRole('listitem')).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Given импортированная история When я открываю «Прогресс» Then «Перенесено из истории» и разовое сообщение, без горизонтального скролла', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto('/#/progress');
  await expect(page.getByTestId('level')).toHaveText('1');
  // 30 Todoist tasks done on one day: 300 raw points, capped at 100
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('lifeos');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction('tasks', 'readwrite');
          const done = new Date(2026, 0, 15, 10).getTime();
          for (let i = 0; i < 30; i++)
            tx.objectStore('tasks').put({
              id: `imp-${i}`,
              createdAt: done,
              updatedAt: done,
              title: `Импорт ${i}`,
              priority: 4,
              tags: [],
              completedAt: done,
              source: 'todoist',
              externalId: `ext-${i}`,
            });
          tx.oncomplete = () => {
            idb.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByTestId('xp-imported')).toHaveText('Перенесено из истории: 100 очков');
  await expect(page.getByText('Твоя история учтена: уровень 2')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.reload();
  await expect(page.getByTestId('xp-imported')).toBeVisible();
  await expect(page.getByText(/Твоя история учтена/)).toHaveCount(0);
});
