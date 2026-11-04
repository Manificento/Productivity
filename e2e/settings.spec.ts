import { expect, test } from '@playwright/test';

test.describe('settings', () => {
  test('demo data: fill an empty app, then replacing own data warns and offers an export first', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00+05:00'));
    await page.goto('/#/settings');
    const fill = page.getByRole('button', { name: 'Заполнить демо-данными' });
    expect((await fill.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await fill.click();
    const dialog = page.getByRole('dialog', { name: 'Заполнить демо-данными?' });
    await expect(dialog).toContainText('примером за 14 дней');
    await dialog.getByRole('button', { name: 'Заполнить' }).click();
    await expect(page.getByRole('status')).toHaveText('Демо-данные загружены');

    await page.goto('/#/today');
    await expect(page.getByRole('link', { name: 'IELTS через 5 дней · Подготовка' })).toBeVisible();
    await page.goto('/#/health');
    await expect(page.getByRole('img', { name: /Длительность сна за 14 дней: записей 14/ })).toBeVisible();

    await page.goto('/#/settings');
    await fill.click();
    await expect(dialog.getByRole('note', { name: 'Предупреждение' })).toContainText(
      'Все ваши текущие данные будут заменены',
    );
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Сначала экспорт' }).click();
    expect((await download).suggestedFilename()).toBe('lifeos-backup-2026-11-04.json');
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toBeHidden();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
