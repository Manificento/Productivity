import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

/**
 * The main promise of the app in one run: an important event changes the day in every block,
 * and survives a backup to another device. 4 Nov 2026, exam on 9 Nov (5 days ahead, 7 days of prep).
 */
const NOW = new Date('2026-11-04T10:00:00+05:00');

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectPrepOnToday(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Сегодня', level: 1 })).toBeVisible();
  await expect(page.getByText('Цели дня · Подготовка')).toBeVisible();
  await expect(page.getByText('Подготовка к «IELTS»: +3 фокус-сессии на проект события')).toBeVisible();
  await expect(page.getByRole('link', { name: 'IELTS через 5 дней · Подготовка' })).toBeVisible();
}

async function expectFocusTaskFirst(page: Page) {
  await page.goto('/#/tasks');
  const today = page.getByRole('region', { name: 'Сегодня', exact: true });
  const first = today.getByRole('listitem').first();
  await expect(first).toContainText('Эссе');
  await expect(first.getByText('фокус', { exact: true })).toBeVisible();
}

test('экзамен перестраивает режим во всех блоках и переживает экспорт/импорт', async ({ page, browser }) => {
  await page.clock.setFixedTime(NOW);
  await skipOnboarding(page);

  // A task outside the project with a higher priority, to see the focus project win.
  await page.goto('/#/tasks');
  const field = page.getByLabel('Новая задача');
  await field.fill('Позвонить в банк !1');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Проекты' }).click();
  await page.getByLabel('Новый проект').fill('Английский');
  await page.getByRole('button', { name: 'Создать проект' }).click();
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Сегодня' }).click();
  await field.fill('Эссе #Английский');
  await page.getByRole('button', { name: 'Добавить' }).click();
  // Before the event the higher priority wins and nothing is in focus.
  const todayList = page.getByRole('region', { name: 'Сегодня', exact: true });
  await expect(todayList.getByRole('listitem').first()).toContainText('Позвонить в банк');
  await expect(todayList.getByText('фокус', { exact: true })).toHaveCount(0);

  // Normal day before the event: 4 focus sessions.
  await page.goto('/#/time/pomodoro');
  await page.getByRole('button', { name: 'Добавить стартовый набор' }).click();
  await expect(page.getByText('0 из 4', { exact: true })).toBeVisible();

  await page.goto('/#/today/events');
  await page.getByRole('button', { name: 'Добавить событие' }).click();
  const form = page.getByRole('dialog', { name: 'Новое событие' });
  await form.getByLabel('Название').fill('IELTS');
  await form.getByLabel('Тип').selectOption('exam');
  await form.getByLabel('Дата').fill('2026-11-09');
  await form.getByRole('radio', { name: 'Критичное' }).click();
  await form.getByLabel('Проект').selectOption({ label: 'Английский' });
  await form.getByLabel('Дней подготовки').fill('7');
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('region', { name: 'Предстоящие' }).getByRole('link', { name: /IELTS/ })).toBeVisible();

  await test.step('Given чистое приложение When я создаю экзамен через 5 дней с проектом «Английский» и задачу в этом проекте Then на «Сегодня» фаза «Подготовка» и причины', async () => {
    await expectPrepOnToday(page);
    await noHorizontalScroll(page);
  });

  await test.step('Given тот же экзамен When я открываю «Задачи» Then задача проекта первая с чипом «фокус»', async () => {
    await expectFocusTaskFirst(page);
    await noHorizontalScroll(page);
  });

  await test.step('Given тот же экзамен When я открываю Pomodoro Then норма фокус-сессий выросла', async () => {
    await page.goto('/#/time/pomodoro');
    // 4 on a normal day (checked above) + importance 3.
    await expect(page.getByText('0 из 7', { exact: true })).toBeVisible();
  });

  await test.step('Given тот же экзамен When я открываю «Здоровье» Then цель сна 8 ч и ограничение интенсивности', async () => {
    await page.goto('/#/health');
    await expect(page.getByRole('region', { name: 'Цель сна' })).toContainText('Сегодня: 8 ч');
    await page.getByRole('link', { name: 'Тренировки' }).click();
    await page.getByLabel('RPE (1–10)').selectOption('9');
    await expect(page.getByRole('note', { name: 'Предупреждение об интенсивности' })).toContainText(
      /умеренная интенсивность — RPE до \d/,
    );
    await noHorizontalScroll(page);
  });

  await test.step('Given все данные When я делаю экспорт, очищаю и импортирую Then всё восстановлено', async () => {
    await page.goto('/#/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспорт в JSON' }).click();
    const file = await (await download).path();

    // «Очищаю»: a new browser context is an empty app (a new device).
    const fresh = await browser.newContext({
      viewport: { width: 360, height: 740 },
      locale: 'ru-RU',
      timezoneId: 'Asia/Almaty',
    });
    const other = await fresh.newPage();
    await other.clock.setFixedTime(NOW);
    await other.goto('/#/settings');
    other.on('dialog', (d) => void d.accept());
    await other.locator('input[type="file"]').setInputFiles(file);
    await expect(other.getByText('Данные восстановлены')).toBeVisible();

    await expectPrepOnToday(other);
    await expectFocusTaskFirst(other);
    await other.goto('/#/time/pomodoro');
    await expect(other.getByText('0 из 7', { exact: true })).toBeVisible();
    await fresh.close();
  });
});
