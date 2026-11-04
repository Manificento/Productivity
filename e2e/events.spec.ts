import { expect, test } from '@playwright/test';

test.describe('important events', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T10:00:00+05:00'));
  });

  test('create an exam, see its timeline, edit and delete it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /События/ }).click();
    await expect(page.getByRole('heading', { name: 'События' })).toBeVisible();
    await expect(page.getByText(/Пока нет событий/)).toBeVisible();

    await page.getByRole('button', { name: 'Добавить событие' }).click();
    const form = page.getByRole('dialog', { name: 'Новое событие' });
    await form.getByLabel('Название').fill('IELTS');
    await form.getByLabel('Тип').selectOption('exam');
    await form.getByLabel('Дата').fill('2026-11-09');
    await form.getByRole('radio', { name: 'Критичное' }).click();
    await form.getByLabel('Дней подготовки').fill('7');
    await form.getByRole('button', { name: 'Сохранить' }).click();

    const upcoming = page.getByRole('region', { name: 'Предстоящие' });
    await expect(upcoming.getByRole('link', { name: /IELTS/ })).toContainText('через 5 дней');

    await upcoming.getByRole('link', { name: /IELTS/ }).click();
    await expect(page.getByRole('heading', { name: 'IELTS' })).toBeVisible();
    await expect(page.getByText('Сейчас: подготовка · событие через 5 дней')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Таймлайн' }).getByRole('listitem')).toHaveText([
      /Подготовка/,
      /Разгрузка/,
      /Событие/,
      /Восстановление/,
    ]);
    const plan = page.getByRole('table', { name: 'План на 10 дней' });
    await expect(plan.getByRole('row')).toHaveCount(11);
    await expect(plan.getByRole('row').nth(1)).toContainText('подгот.');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Изменить' }).click();
    const edit = page.getByRole('dialog', { name: 'Изменить событие' });
    const livePlan = edit.getByRole('table', { name: 'План на 10 дней' });
    await expect(livePlan.getByRole('row').nth(1).getByRole('cell').last()).toHaveText('7');
    await edit.getByRole('radio', { name: 'Обычное' }).click();
    await expect(livePlan.getByRole('row').nth(1).getByRole('cell').last()).toHaveText('5');
    await edit.getByRole('radio', { name: 'Критичное' }).click();
    await edit.getByLabel('Дата').fill('2026-11-05');
    await edit.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Сейчас: разгрузка · событие завтра')).toBeVisible();

    await page.goto('/');
    await expect(page.getByText(/Цели дня · Разгрузка перед событием/)).toBeVisible();

    await page.getByRole('link', { name: /События/ }).click();
    await page.getByRole('link', { name: /IELTS/ }).click();
    await page.getByRole('button', { name: 'Удалить' }).click();
    await page.getByRole('dialog', { name: 'Удалить событие?' }).getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText(/Пока нет событий/)).toBeVisible();

    await page.goto('/');
    await expect(page.getByText(/Цели дня · Обычный день/)).toBeVisible();
  });
});
