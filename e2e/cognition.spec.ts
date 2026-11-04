import { expect, test } from '@playwright/test';

/**
 * PVT end to end. `?duration=12` (honoured only under WebDriver) keeps the run short while
 * still guaranteeing the first stimulus (2–10 s after the start) appears before the end.
 */
test.describe('cognition: PVT', () => {
  // Two real-time runs of 12 s each.
  test.setTimeout(60_000);

  test('a short run from the morning flow: false start, reaction, results, back to Today, history', async ({
    page,
  }) => {
    for (let run = 1; run <= 2; run++) {
      await page.goto('/#/cognition/pvt?return=/&duration=12');
      await page.getByRole('button', { name: 'Начать' }).click();
      const area = page.getByRole('button', { name: 'Область реакции' });

      if (run === 1) {
        await area.click();
        await expect(page.getByText('Фальстарт — рано!')).toBeVisible();
      }

      await expect(page.getByText('Жми!')).toBeVisible({ timeout: 11_000 });
      await area.click();

      await expect(page.getByText('Медиана реакции')).toBeVisible({ timeout: 13_000 });
      await expect(page.getByText('Результат сохранён.')).toBeVisible();
      if (run === 1)
        await expect(page.getByText('Фальстарты').locator('xpath=following-sibling::dd[1]')).toHaveText('1');

      await page.getByRole('button', { name: 'Готово' }).click();
      await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
    }

    await page.goto('/#/cognition');
    await expect(page.getByRole('img', { name: /Медиана реакции за 14 дней/ })).toBeVisible();
    await expect(page.getByText(/Последний результат/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
