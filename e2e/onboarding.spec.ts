import { expect, test } from '@playwright/test';

test('first run: the nearest event, a 10-day plan, then «Сегодня» for good', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T10:00:00+05:00'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Какое у тебя ближайшее важное событие?' })).toBeVisible();
  await expect(page.getByText(/Цели дня/)).toHaveCount(0);

  await page.getByLabel('Название').fill('IELTS');
  await page.getByLabel('Дата').fill('2026-11-09');
  await page.getByRole('radio', { name: 'Критичное' }).click();
  await page.getByRole('button', { name: 'Дальше' }).click();

  const plan = page.getByRole('table', { name: 'План на 10 дней' });
  await expect(plan).toBeVisible();
  await expect(plan.getByText('событие')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByRole('heading', { name: 'Сегодня', level: 1 })).toBeVisible();
  await expect(page.getByText(/Цели дня/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Цели дня/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Какое у тебя ближайшее важное событие?' })).toHaveCount(0);
});
