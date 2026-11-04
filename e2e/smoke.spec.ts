import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test.describe('smoke', () => {
  test('opens on Today with daily targets', async ({ page }) => {
    await skipOnboarding(page);
    await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
    await expect(page.getByText(/Цели дня/)).toBeVisible();
  });

  test('bottom navigation reaches the pinned blocks, and «Блоки» every other one', async ({ page }) => {
    await skipOnboarding(page);
    const nav = page.getByRole('navigation', { name: 'Модули' });
    for (const name of ['Задачи', 'Привычки', 'Время']) {
      await nav.getByRole('link', { name: new RegExp(name) }).click();
      await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    }
    await nav.getByRole('link', { name: /Блоки/ }).click();
    await page.getByRole('link', { name: /Сон/ }).click();
    await expect(page.getByRole('heading', { name: 'Сон', level: 1 })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Блоки/ })).toHaveAttribute('aria-current', 'page');
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
