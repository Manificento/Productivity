import { expect, test } from '@playwright/test';

test.describe('health', () => {
  test('log last night, update it, and see it in the 14-day chart', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/health');
    await expect(page.getByLabel('День подъёма')).toHaveValue('2026-11-04');
    await expect(page.getByRole('link', { name: 'Сон' })).toBeVisible();
    await expect(page.getByLabel('Отбой', { exact: true })).toHaveValue('23:30');
    await expect(page.getByLabel('Подъём', { exact: true })).toHaveValue('07:30');
    await expect(page.getByText('Записей пока нет')).toBeVisible();

    await page.getByLabel('Подъём', { exact: true }).fill('07:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Сохранено: 7,5 ч')).toBeVisible();
    await expect(page.getByRole('img', { name: /Длительность сна за 14 дней: записей 1/ })).toBeVisible();
    await expect(page.getByText('Среднее за 7 дней: 7,5 ч')).toBeVisible();

    await page.getByLabel('Отбой', { exact: true }).fill('00:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Среднее за 7 дней: 7 ч')).toBeVisible();
    await expect(page.getByRole('img', { name: /записей 1/ })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('tabs lead to food and workouts', async ({ page }) => {
    await page.goto('/#/health');
    await page.getByRole('link', { name: 'Тренировки' }).click();
    await expect(page).toHaveURL(/#\/health\/workouts$/);
    await expect(page.getByText('Новая тренировка')).toBeVisible();
    await page.getByRole('link', { name: 'Еда' }).click();
    await expect(page).toHaveURL(/#\/health\/food$/);
    await expect(page.getByText('Модуль «Еда» ещё строится')).toBeVisible();
  });

  test('workouts: log one with an exercise, repeat it, see the week totals', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T19:00:00'));
    await page.goto('/#/health/workouts');
    await expect(page.getByText('За последние 60 дней тренировок нет — запишите первую')).toBeVisible();

    await page.getByLabel('Тип').selectOption('Силовая');
    await page.getByLabel('Длительность, мин').fill('60');
    await page.getByLabel('RPE (1–10)').selectOption('8');
    await page.getByRole('button', { name: '+ Упражнение' }).click();
    await page.getByLabel('Упражнение 1: название').fill('Присед');
    const remove = await page.getByRole('button', { name: 'Удалить упражнение 1' }).boundingBox();
    expect(remove?.width).toBeGreaterThanOrEqual(44);
    await page.getByLabel('Упражнение 1, подход 1: повторы').fill('5');
    await page.getByLabel('Упражнение 1, подход 1: вес, кг').fill('100');
    await page.getByRole('button', { name: 'Сохранить тренировку' }).click();

    const history = page.getByRole('list', { name: 'История тренировок' });
    await expect(history.getByText('Присед: 5 × 100 кг')).toBeVisible();

    await history.getByRole('button', { name: /^Повторить/ }).click();
    await expect(page.getByLabel('Упражнение 1: название')).toHaveValue('Присед');
    await page.getByRole('button', { name: 'Сохранить тренировку' }).click();
    await expect(history.getByRole('listitem', { name: /Силовая/ })).toHaveCount(2);

    await expect(page.getByText('Минуты').locator('xpath=following-sibling::dd[1]')).toHaveText('120');
    await expect(page.getByText('Средний RPE').locator('xpath=following-sibling::dd[1]')).toHaveText('8');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('adaptation: short sleep shows the gap to the goal and a soft warning for a hard workout', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.goto('/#/health');
    await page.getByLabel('Отбой', { exact: true }).fill('02:00');
    await page.getByLabel('Подъём', { exact: true }).fill('07:00');
    await page.getByRole('button', { name: 'Сохранить сон' }).click();
    await expect(page.getByText('Прошлая ночь: 5 ч')).toBeVisible();
    await expect(page.getByText('(−2,5 ч)')).toBeVisible();

    await page.getByRole('link', { name: 'Тренировки' }).click();
    await page.getByLabel('RPE (1–10)').selectOption('7');
    const warning = page.getByRole('note', { name: 'Предупреждение об интенсивности' });
    await expect(warning).toContainText('RPE до 4');
    await expect(warning).toContainText('тренировка не выше лёгкой');
  });
});
