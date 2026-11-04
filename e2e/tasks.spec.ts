import { expect, test } from '@playwright/test';

test.describe('tasks', () => {
  test('add a task, then complete it', async ({ page }) => {
    await page.goto('/#/tasks');
    await page.getByLabel('Новая задача').fill('Купить молоко');
    await page.getByRole('button', { name: 'Добавить' }).click();

    const inbox = page.getByRole('region', { name: 'Входящие' });
    await expect(inbox.getByText('Купить молоко')).toBeVisible();

    await inbox.getByRole('checkbox', { name: 'Выполнено: Купить молоко' }).click();

    const done = page.getByRole('region', { name: 'Выполнено сегодня' });
    await expect(done.getByText('Купить молоко')).toBeVisible();
    await expect(inbox.getByText('Купить молоко')).toHaveCount(0);
  });
});
