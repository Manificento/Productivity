import { expect, test } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

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

  test('Given событие через 10 дней When я смотрю план на 2 недели Then разгрузка и день отдыха отмечены заранее', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T10:00:00+05:00'));
    await skipOnboarding(page);
    await page.getByRole('link', { name: /События/ }).click();
    await page.getByRole('button', { name: 'Добавить событие' }).click();
    const form = page.getByRole('dialog', { name: 'Новое событие' });
    await form.getByLabel('Название').fill('IELTS');
    await form.getByLabel('Тип').selectOption('exam');
    await form.getByLabel('Дата').fill('2026-11-14');
    await form.getByRole('radio', { name: 'Критичное' }).click();
    await form.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('region', { name: 'Предстоящие' }).getByRole('link', { name: /IELTS/ })).toBeVisible();

    await page.goto('/#/training');
    await page.getByRole('button', { name: 'Шаблон: Растяжка' }).click();
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    const plan = page.getByRole('list', { name: 'План на 2 недели' });
    await expect(plan.getByRole('listitem', { name: /13 ноября/ })).toContainText('Разгрузка');
    await expect(plan.getByRole('listitem', { name: /14 ноября/ })).toContainText('День отдыха');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Given пропущенная сессия When я переношу её на другой день Then она снова в плане; а в конце плана его можно продлить', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-03T08:00:00')); // Tuesday — a «Растяжка» day
    await page.goto('/#/training');
    await page.getByRole('button', { name: 'Шаблон: Растяжка' }).click();
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await expect(page.getByRole('list', { name: 'Сессия на сегодня' })).toBeVisible();

    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00'));
    await page.reload();
    const missed = page.getByRole('list', { name: 'Пропущенные сессии' });
    await expect(missed).toContainText('пропущена');
    await missed.getByRole('button', { name: /Перенести/ }).click();
    await page.getByLabel('Новая дата').fill('2026-11-06');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('list', { name: 'Пропущенные сессии' })).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'План на 2 недели' }).getByRole('listitem', { name: /6 ноября/ }),
    ).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.clock.setFixedTime(new Date('2026-11-25T08:00:00')); // the plan ends on 11-29
    await page.reload();
    await page.getByRole('button', { name: /Продлить план на 4 недели/ }).click();
    await expect(page.getByRole('button', { name: /Продлить план на 4 недели/ })).toHaveCount(0);

    await page.clock.setFixedTime(new Date('2026-12-20T08:00:00')); // still running thanks to the extension
    await page.reload();
    await expect(page.getByText('План завершён')).toHaveCount(0);
  });
});
