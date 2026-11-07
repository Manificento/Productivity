import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test('Given пустой блок When я пишу заметку с markdown и ищу её Then она сохранена, видна в предпросмотре и находится поиском', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto('/#/notes');
  await expect(page.getByText(/Заметок пока нет/)).toBeVisible();
  await page.getByRole('button', { name: 'Новая заметка' }).click();
  await page.getByLabel('Название').fill('Экзамен');
  await page.getByLabel('Текст заметки').fill('# План\n- [x] паспорт');
  await page.getByRole('button', { name: 'Предпросмотр' }).click();
  await expect(page.getByRole('heading', { name: 'План' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByLabel('Поиск').fill('ПАСПОРТ');
  await expect(page.getByRole('button', { name: /Экзамен/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Given сегодняшний день When я нажимаю «Сегодня» Then открывается дневная страница без горизонтальной прокрутки', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto('/#/notes');
  await page.getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByLabel('Название')).not.toHaveValue('');
  await expect(page.getByRole('button', { name: 'Удалить' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
