import { expect, test } from '@playwright/test';

test.describe('tasks', () => {
  test('add a task, then complete it', async ({ page }) => {
    await page.goto('/#/tasks/inbox');
    await page.getByLabel('Новая задача').fill('Купить молоко');
    await page.getByRole('button', { name: 'Добавить' }).click();

    const inbox = page.getByRole('region', { name: 'Входящие' });
    await expect(inbox.getByText('Купить молоко')).toBeVisible();

    await inbox.getByRole('checkbox', { name: 'Выполнено: Купить молоко' }).click();
    await expect(inbox.getByText('Купить молоко')).toHaveCount(0);

    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Сегодня' }).click();
    const done = page.getByRole('region', { name: 'Выполнено сегодня' });
    await expect(done.getByText('Купить молоко')).toBeVisible();
  });

  test('create a project and add a task to it', async ({ page }) => {
    await page.goto('/#/tasks');
    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Проекты' }).click();
    await page.getByLabel('Новый проект').fill('Учёба');
    await page.getByRole('button', { name: 'Создать проект' }).click();
    await page.getByRole('link', { name: '#Учёба' }).click();

    await expect(page.getByRole('heading', { name: '#Учёба' })).toBeVisible();
    await page.getByLabel('Новая задача').fill('Конспект');
    await page.getByRole('button', { name: 'Добавить' }).click();
    await expect(page.getByRole('region', { name: 'Задачи проекта' }).getByText('Конспект')).toBeVisible();

    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Входящие' }).click();
    await expect(page.getByRole('region', { name: 'Входящие' }).getByText('#Учёба')).toBeVisible();
  });
});

test.describe('quick add', () => {
  test('a quick add line lands in «Предстоящие» with its project', async ({ page }) => {
    // Fixed noon, so «завтра» cannot drift across midnight during the run.
    await page.clock.setFixedTime(new Date(2026, 10, 4, 12, 0));
    await page.goto('/#/tasks/inbox');
    const field = page.getByLabel('Новая задача');
    await field.fill('завтра 9:00 позвонить научнику #учёба !1');
    await expect(page.getByRole('list', { name: 'Распознано' })).toContainText('Завтра 09:00');
    await page.getByRole('button', { name: 'Добавить' }).click();
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();

    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Предстоящие' }).click();
    const tomorrow = page.getByRole('region', { name: /^Завтра/ });
    await expect(tomorrow.getByText('позвонить научнику')).toBeVisible();
    await expect(tomorrow.getByText('#учёба')).toBeVisible();
    await expect(tomorrow.getByText('09:00')).toBeVisible();
  });
});

test.describe('repeating tasks', () => {
  test('completing a daily task schedules tomorrow’s copy', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 4, 12, 0));
    await page.goto('/#/tasks');
    await page.getByLabel('Новая задача').fill('каждый день зарядка');
    await page.getByRole('button', { name: 'Добавить' }).click();

    const today = page.getByRole('region', { name: 'Сегодня' });
    await today.getByRole('checkbox', { name: 'Выполнено: зарядка' }).click();
    await expect(page.getByRole('region', { name: 'Выполнено сегодня' }).getByText('зарядка')).toBeVisible();

    await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Предстоящие' }).click();
    await expect(page.getByRole('region', { name: /^Завтра/ }).getByText('зарядка')).toBeVisible();
  });
});
