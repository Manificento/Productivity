import { expect, test } from '@playwright/test';

test('edit the baseline, see normal-day targets change, then reset', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Базовый режим/ }).click();
  await expect(page.getByRole('heading', { name: 'Базовый режим' })).toBeVisible();

  await page.getByLabel('Ёмкость дня, мин').fill('0');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('alert')).toHaveText('От 1 до 960 минут');

  await page.getByLabel('Ёмкость дня, мин').fill('300');
  await page.getByLabel('Отбой').fill('23:00');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('status')).toContainText('Сохранено');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('link', { name: '← Сегодня' }).click();
  await expect(page.getByText('5 ч', { exact: true })).toBeVisible();
  await expect(page.getByText(/отбой 23:00/)).toBeVisible();

  await page.getByRole('link', { name: /Базовый режим/ }).click();
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.getByLabel('Ёмкость дня, мин')).toHaveValue('360');
  await expect(page.getByLabel('Отбой')).toHaveValue('23:30');
});
