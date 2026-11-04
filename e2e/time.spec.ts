import { expect, test } from '@playwright/test';

test.describe('time', () => {
  test('starter categories, timer survives reload, stop', async ({ page }) => {
    await page.goto('/#/time');
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();

    await page.getByRole('button', { name: 'Учёба' }).click();
    const timer = page.getByRole('timer', { name: 'Идущий таймер' });
    await expect(timer).toContainText('Учёба');
    await expect(timer).toContainText(/00:0[0-9]/);

    await page.reload();
    await expect(timer).toContainText('Учёба');

    await page.getByRole('button', { name: 'Стоп' }).click();
    await expect(timer).toBeHidden();
  });

  test('manual entry rejects an end before the start', async ({ page }) => {
    await page.goto('/#/time');
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();
    await page.getByRole('button', { name: '+ Запись вручную' }).click();

    const dialog = page.getByRole('dialog', { name: 'Запись вручную' });
    await dialog.getByLabel('Начало').fill('2026-11-02T09:00');
    await dialog.getByLabel('Конец').fill('2026-11-02T08:00');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Конец должен быть позже начала');

    await dialog.getByLabel('Конец').fill('2026-11-02T10:00');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('status')).toHaveText('Запись сохранена');
  });

  test('no horizontal scroll on the time screen at 360 px', async ({ page }) => {
    await page.goto('/#/time');
    await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();
    await page.getByRole('button', { name: 'Работа' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
