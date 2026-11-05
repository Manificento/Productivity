import { expect, test } from '@playwright/test';

test.describe('nutrition weight', () => {
  test('Given пустой журнал When ввожу 72,4 и ещё раз 72,0 Then одна запись за день; 400 — ошибка', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/nutrition');
    await expect(page.getByText(/Записей веса пока нет/)).toBeVisible();
    await page.getByLabel('Вес, кг').fill('400');
    await page.getByRole('button', { name: 'Записать' }).click();
    await expect(page.getByRole('alert')).toContainText('кг');
    await page.getByLabel('Вес, кг').fill('72,4');
    await page.getByRole('button', { name: 'Записать' }).click();
    await expect(page.getByText('Записано: 72,4 кг')).toBeVisible();
    await page.getByLabel('Вес, кг').fill('72,0');
    await page.getByRole('button', { name: 'Записать' }).click();
    await expect(page.getByRole('img', { name: /Вес: записей 1/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
