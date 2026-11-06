import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

test.describe('habits', () => {
  test('starter set: tick three, add, exactly three habits appear', async ({ page }) => {
    await page.goto('/#/habits');
    await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toBeDisabled();
    for (const name of ['Медитация', 'Английский', 'Отбой вовремя']) {
      await page.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
    }
    await page.getByRole('button', { name: 'Добавить (3)' }).click();
    await expect(page.getByRole('list', { name: 'Привычки на сегодня' }).getByRole('listitem')).toHaveCount(3);
  });

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

    // touch targets ≥ 44 px at 360 px
    const cell = page.getByRole('button', { name: /^4 ноября:/ });
    const box = await cell.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    // back-fill yesterday
    await cell.click();
    await expect(page.getByRole('button', { name: '4 ноября: выполнено' })).toBeVisible();
    await expect(page.getByText('Серия сейчас').locator('..')).toContainText('🔥1');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
  test('Given привычка в «Не сегодня» When хочу отметить лишний раз Then открываю её карточку и отмечаю день в календаре', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-11-05T20:00:00+05:00') });
    await page.goto('/#/habits');
    await page.getByRole('button', { name: '+ Привычка' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новая привычка' });
    await dialog.getByLabel('Название').fill('Зал');
    await dialog.getByRole('radio', { name: 'N раз в неделю' }).click();
    await dialog.getByLabel('Сколько раз в неделю').fill('1');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();

    // goal met by a mark on an earlier day of this week → the habit leaves today's list
    await page.getByRole('link', { name: 'Открыть «Зал»' }).click();
    await page.getByRole('button', { name: /^4 ноября:/ }).click();
    await expect(page.getByRole('button', { name: '4 ноября: выполнено' })).toBeVisible();
    await page.goBack();

    const row = page.getByRole('link', { name: 'Открыть «Зал»' });
    await expect(row).toContainText('цель недели выполнена');
    await expect(page.getByRole('button', { name: 'Отметить «Зал»' })).toHaveCount(0);

    // an extra mark: open the card and mark the day in the calendar
    await row.click();
    await page.getByRole('button', { name: /^5 ноября:/ }).click();
    await expect(page.getByRole('button', { name: '5 ноября: выполнено' })).toBeVisible();
  });

  test('Given день экзамена When открываю привычки Then активна только ключевая, остальная — в «Сегодня не считаются»', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T10:00:00+05:00'));
    await skipOnboarding(page);
    await page.goto('/#/habits');
    for (const [name, essential] of [
      ['Учёба', true],
      ['Прогулка', false],
    ] as const) {
      await page.getByRole('button', { name: '+ Привычка' }).click();
      const dialog = page.getByRole('dialog', { name: 'Новая привычка' });
      await dialog.getByLabel('Название').fill(name);
      if (essential) await dialog.getByRole('checkbox', { name: /Ключевая/ }).check();
      await dialog.getByRole('button', { name: 'Сохранить' }).click();
    }
    const list = page.getByRole('list', { name: 'Привычки на сегодня' });
    await expect(list.getByRole('listitem')).toHaveCount(2);

    await page.goto('/#/');
    await page.getByRole('link', { name: /События/ }).click();
    await page.getByRole('button', { name: 'Добавить событие' }).click();
    const form = page.getByRole('dialog', { name: 'Новое событие' });
    await form.getByLabel('Название').fill('Экзамен');
    await form.getByLabel('Тип').selectOption('exam');
    await form.getByLabel('Дата').fill('2026-11-04');
    await form.getByRole('button', { name: 'Сохранить' }).click();

    await page.goto('/#/habits');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Учёба');
    const paused = page.getByText('Сегодня не считаются').locator('..');
    await expect(paused).toContainText('Прогулка');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
