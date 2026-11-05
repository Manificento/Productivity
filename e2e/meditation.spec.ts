import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test('Given пустой блок When я открываю «Медитация» Then выбор длительности и паттерна, кнопка «Начать» ≥ 44 px, без горизонтального скролла', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto('/#/meditation');
  await expect(page.getByRole('heading', { name: 'Медитация', level: 1 })).toBeVisible();
  await expect(page.getByRole('radio', { name: '10 мин' })).toBeVisible();
  const start = page.getByRole('button', { name: 'Начать', exact: true });
  expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await start.click();
  await expect(page.getByLabel('Осталось времени')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Given библиотека When я выбираю сессию «фокус» Then вижу шаги гида и могу начать', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('/#/meditation');
  await page.getByRole('radio', { name: 'фокус' }).click();
  await page.getByRole('button', { name: /Одна точка/ }).click();
  await page.getByRole('button', { name: /Начать «Одна точка»/ }).click();
  await expect(page.getByText(/шаг 1 из 3/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
