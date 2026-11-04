import { expect, test } from '@playwright/test';

test('insights explain how much data is still needed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Инсайты/ }).click();
  await expect(page.getByRole('heading', { name: 'Инсайты' })).toBeVisible();
  for (const name of [
    'Сон ↔ выполненные задачи следующего дня',
    'Сон ↔ фокус-минуты',
    'Тренировка ↔ энергия на следующее утро',
  ]) {
    await expect(page.getByRole('region', { name }).getByText(/Мало данных — нужно ещё 7 дней/)).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
