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
  test('Todoist CSV: preview, confirm, repeat upload does not duplicate and keeps tasks completed in LifeOS', async ({
    page,
  }) => {
    await page.goto('/#/settings');
    const pick = async () => {
      await page.getByLabel('Файл CSV Todoist').setInputFiles('docs/samples/todoist-template.csv');
      return page.getByRole('dialog', { name: 'Импорт из Todoist' });
    };
    let dialog = await pick();
    await expect(dialog).toContainText('Найдено 4 задачи, 1 проект');
    await expect(dialog).toContainText('3 срока не распознаны, проверьте после импорта');
    await dialog.getByRole('button', { name: 'Импортировать' }).click();
    await expect(page.getByRole('status')).toContainText('новых задач 4');
    dialog = await pick();
    await dialog.getByRole('button', { name: 'Импортировать' }).click();
    await expect(page.getByRole('status')).toContainText('новых задач 0, обновлено 4');

    // A task completed in LifeOS stays completed after one more upload (#194).
    await page.goto('/#/tasks/inbox');
    await page.getByRole('checkbox', { name: 'Выполнено: Call that very important client' }).click();
    await page.goto('/#/settings');
    dialog = await pick();
    await expect(dialog).toContainText('1 уже выполнена в LifeOS, останется выполненной');
    await dialog.getByRole('button', { name: 'Импортировать' }).click();
    await expect(page.getByRole('status')).toContainText('новых задач 0, обновлено 4');
    await page.goto('/#/tasks/inbox');
    await expect(page.getByRole('checkbox', { name: 'Выполнено: Clean the house' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Выполнено: Call that very important client' })).toHaveCount(0);
    await page.goto('/#/settings');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
