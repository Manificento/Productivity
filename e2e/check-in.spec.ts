import { expect, test } from '@playwright/test';

test('daily check-in lowers the load and stays one record per day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T08:00:00+05:00'));
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Как вы сегодня?' });
  await card.getByRole('radio', { name: 'Энергия: 2' }).click();
  await card.getByRole('radio', { name: 'Фокус: 3' }).click();
  await card.getByRole('button', { name: 'Сохранить' }).click();

  await expect(card).toContainText('Энергия 2/5 · фокус 3/5');
  await expect(page.getByText(/Низкая энергия.*нагрузка −20%/)).toBeVisible();

  await card.getByRole('button', { name: 'Изменить' }).click();
  await card.getByRole('radio', { name: 'Энергия: 4' }).click();
  await card.getByRole('button', { name: 'Сохранить' }).click();
  await expect(card).toContainText('Энергия 4/5 · фокус 3/5');
  await expect(page.getByText(/Низкая энергия/)).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
