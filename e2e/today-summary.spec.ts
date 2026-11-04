import { expect, test } from '@playwright/test';

test('Today shows the active event on top and hints for blocks without data', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00+05:00'));
  await page.goto('/#/today/events');
  await page.getByRole('button', { name: 'Добавить событие' }).click();
  const form = page.getByRole('dialog', { name: 'Новое событие' });
  await form.getByLabel('Название').fill('IELTS');
  await form.getByLabel('Дата').fill('2026-11-07');
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('region', { name: 'Предстоящие' }).getByRole('link', { name: /IELTS/ })).toBeVisible();

  await page.getByRole('link', { name: '← Сегодня' }).click();
  await expect(page.getByRole('link', { name: 'IELTS через 3 дня · Подготовка' })).toBeVisible();
  await expect(page.getByText('На сегодня задач нет.')).toBeVisible();
  await expect(page.getByText('На сегодня привычек нет.')).toBeVisible();
  await expect(page.getByText('Фокус-сессий сегодня ещё не было.')).toBeVisible();
  await expect(page.getByText('Сон и тренировки сегодня не записаны.')).toBeVisible();

  await page.getByRole('link', { name: 'Запустить' }).click();
  await expect(page).toHaveURL(/#\/time/);

  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
