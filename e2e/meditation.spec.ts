import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test('Given пустой блок When я открываю «Медитация» Then выбор длительности и паттерна, кнопка «Начать» ≥ 44 px, без горизонтального скролла', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto('/#/meditation');
  await expect(page.getByRole('heading', { name: 'Медитация', level: 1 })).toBeVisible();
  await expect(page.getByRole('radio', { name: '10 мин' })).toBeVisible();
  const start = page.getByRole('button', { name: 'Начать' });
  expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await start.click();
  await expect(page.getByLabel('Осталось времени')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
