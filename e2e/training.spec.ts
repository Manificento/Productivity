import { expect, test } from '@playwright/test';

test.describe('training programs', () => {
  test('Given пустой блок When я выбираю шаблон «Сила 3 раза в неделю» Then вижу сессию на сегодня, а после архива — снова пустое состояние', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00')); // Wednesday
    await page.goto('/#/training');
    await expect(page.getByText(/Программ пока нет/)).toBeVisible();

    await page.getByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }).click();
    const formOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(formOverflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await expect(page.getByRole('list', { name: 'Сессия на сегодня' })).toContainText('Румынская тяга');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Архивировать Сила 3 раза в неделю' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Архивировать' }).click();
    await expect(page.getByText(/Программ пока нет/)).toBeVisible();
  });

  test('Given сегодняшняя сессия When я отмечаю подходы и завершаю Then тренировка в истории с подходами и RPE', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00')); // Wednesday
    await page.goto('/#/training');
    await page.getByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }).click();
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await page.getByRole('button', { name: 'Подход 1: Румынская тяга' }).click();
    await page.getByRole('button', { name: 'Подход 2: Румынская тяга' }).click();
    await page.getByLabel('Длительность, мин').first().fill('45');
    await page.getByLabel('RPE (1–10)').first().fill('7');
    await page.getByRole('button', { name: 'Завершить' }).click();
    await expect(page.getByText('Тренировка выполнена ✓')).toBeVisible();
    const item = page.getByRole('list', { name: 'История тренировок' }).getByRole('listitem').first();
    await expect(item).toContainText('45 мин · RPE 7');
    await expect(item).toContainText('Румынская тяга');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
