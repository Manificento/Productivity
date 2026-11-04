import { expect, test } from '@playwright/test';

test.describe('habits', () => {
  test('create a habit, mark it done and undo the mark', async ({ page }) => {
    await page.goto('/#/habits');
    await expect(page.getByText(/Привычек пока нет/)).toBeVisible();

    await page.getByRole('button', { name: '+ Привычка' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новая привычка' });
    await dialog.getByLabel('Название').fill('Чтение');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();

    const mark = page.getByRole('button', { name: 'Отметить «Чтение»' });
    await expect(mark).toBeVisible();
    await expect(page.getByText('🔥0')).toBeVisible();
    const box = await mark.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await mark.click();
    await expect(page.getByRole('button', { name: 'Снять отметку «Чтение»' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('🔥1')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Снять отметку «Чтение»' }).click();
    await expect(page.getByText('🔥0')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('habit screen: 5-week grid, stats, tapping a past day marks it', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-05T20:00:00+05:00') });
    await page.goto('/#/habits');
    await page.getByRole('button', { name: '+ Привычка' }).click();
    await page.getByRole('dialog').getByLabel('Название').fill('Зарядка');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();

    await page.getByRole('link', { name: 'Открыть «Зарядка»' }).click();
    const table = page.getByRole('table', { name: 'Календарь за 5 недель' });
    await expect(table.getByRole('row')).toHaveCount(6);
    await expect(page.getByRole('button', { name: '8 ноября: впереди' })).toBeDisabled();

    // back-fill yesterday
    await page.getByRole('button', { name: /^4 ноября:/ }).click();
    await expect(page.getByRole('button', { name: '4 ноября: выполнено' })).toBeVisible();
    await expect(page.getByText('Серия сейчас').locator('..')).toContainText('🔥1');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
