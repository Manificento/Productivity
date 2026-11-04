import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test.describe('smoke', () => {
  test('opens on Today with daily targets', async ({ page }) => {
    await skipOnboarding(page);
    await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
    await expect(page.getByText(/Цели дня/)).toBeVisible();
  });

  test('bottom navigation reaches every module', async ({ page }) => {
    await skipOnboarding(page);
    for (const name of ['Задачи', 'Привычки', 'Время', 'Здоровье']) {
      await page.getByRole('link', { name: new RegExp(name) }).click();
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
  });

  test('settings offer data export', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page.getByRole('button', { name: 'Экспорт в JSON' })).toBeVisible();
  });

  test('no horizontal scroll on a 360 px screen', async ({ page }) => {
    await skipOnboarding(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
