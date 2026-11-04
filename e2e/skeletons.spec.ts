import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

/** SPEC 0.3 skeleton blocks (#105): the route answers with an empty state, the bottom bar does not list them yet. */
test('Given модули nutrition, training, meditation, progress, notes When я открываю их маршруты Then пустое состояние с названием блока и «скоро»; в навигации они пока скрыты', async ({
  page,
}) => {
  await skipOnboarding(page);
  const nav = page.getByRole('navigation', { name: 'Модули' });
  for (const [id, title] of [
    ['nutrition', 'Питание'],
    ['training', 'Тренировки'],
    ['meditation', 'Медитация'],
    ['progress', 'Прогресс'],
    ['notes', 'Заметки'],
  ]) {
    await page.goto(`/#/${id}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.getByText(`Блок «${title}» — скоро.`)).toBeVisible();
    await expect(nav.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, id).toBeLessThanOrEqual(0);
  }
});
