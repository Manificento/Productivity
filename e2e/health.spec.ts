import { expect, test } from '@playwright/test';

test.describe('health: sleep', () => {
  test('log last night, update it, and see it in the 14-day chart', async ({ page }) => {
    await page.goto('/#/health');
    await expect(page.getByRole('link', { name: 'Сон' })).toBeVisible();
    await expect(page.getByLabel('Отбой', { exact: true })).toHaveValue('23:30');
    await expect(page.getByLabel('Подъём', { exact: true })).toHaveValue('07:30');
    await expect(page.getByText('Записей пока нет')).toBeVisible();

    await page.getByLabel('Подъём', { exact: true }).fill('07:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Сохранено: 7,5 ч')).toBeVisible();
    await expect(page.getByRole('img', { name: /Длительность сна за 14 дней: записей 1/ })).toBeVisible();
    await expect(page.getByText('Среднее за 7 дней: 7,5 ч')).toBeVisible();

    await page.getByLabel('Отбой', { exact: true }).fill('00:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Среднее за 7 дней: 7 ч')).toBeVisible();
    await expect(page.getByRole('img', { name: /записей 1/ })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('tabs lead to food and workouts', async ({ page }) => {
    await page.goto('/#/health');
    await page.getByRole('link', { name: 'Тренировки' }).click();
    await expect(page).toHaveURL(/#\/health\/workouts$/);
    await page.getByRole('link', { name: 'Еда' }).click();
    await expect(page).toHaveURL(/#\/health\/food$/);
  });
});
