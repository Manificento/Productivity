import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './helpers.ts';

/**
 * X2 — extends X1 (`exam-adaptation.spec.ts`): an exam tomorrow rebuilds every block of SPEC 0.3, not only the
 * first four. Wednesday 4 Nov 2026 is the day before the exam (phase «Разгрузка», a «Сила» training day),
 * Thursday 5 Nov is the exam day (phase «День события»). Every block is opened through the bottom bar the way a
 * user would, and on every screen each button and link must be tappable — not hidden under the bottom bar.
 */
const DAY_BEFORE = new Date('2026-11-04T10:00:00+05:00');
const EXAM_DAY = new Date('2026-11-05T08:00:00+05:00');

/** Blocks of the scenario: the name of the link in «Все блоки» (or the pinned tab) and the page heading. */
const BLOCKS = {
  nutrition: { link: 'Питание', heading: 'Питание' },
  training: { link: 'Тренировки', heading: 'Тренировки' },
  meditation: { link: 'Медитация', heading: 'Медитация' },
  mind: { link: 'Тесты', heading: 'Тест внимания' },
  habits: { link: 'Привычки', heading: 'Привычки' },
  progress: { link: 'Прогресс', heading: 'Прогресс' },
} as const;
type Block = keyof typeof BLOCKS;

/** Problems found on the way: buttons covered by something else, horizontal scroll. Checked at the end. */
const problems: string[] = [];

/**
 * Buttons and links of the screen whose centre is covered by another element even when scrolled to them. Limits:
 * each control is scrolled to the middle of the screen and only its centre is tested — so it catches a control
 * that can never come out from under the bottom bar (the end of a page), not one half under it. The bottom bar's
 * own links are tested where they are, without scrolling.
 */
async function coveredControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Модули"]');
    const all = [...document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]')].filter(
      (el) => el.checkVisibility() && el.getBoundingClientRect().width > 1,
    );
    const covered: string[] = [];
    const check = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!hit || !el.contains(hit)) {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName;
        covered.push(`«${name}» под ${hit?.closest('nav, header, [role="dialog"]')?.tagName ?? hit?.tagName}`);
      }
    };
    all.filter((el) => nav?.contains(el)).forEach(check);
    for (const el of all.filter((el) => !nav?.contains(el))) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      check(el);
    }
    window.scrollTo(0, 0);
    return covered;
  });
}

async function checkScreen(page: Page, where: string) {
  for (const c of await coveredControls(page)) problems.push(`${where}: ${c}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`${where}: горизонтальный скролл ${overflow} px`);
}

/** Opens a block through the bottom bar: a pinned tab, otherwise «Блоки» → the block's link. */
async function openBlock(page: Page, block: Block) {
  const { link, heading } = BLOCKS[block];
  const bar = page.getByRole('navigation', { name: 'Модули' });
  const pinned = bar.getByRole('link', { name: new RegExp(`^${link}`) });
  if ((await pinned.count()) > 0) {
    await pinned.click();
  } else {
    await bar.getByRole('link', { name: /Блоки/ }).click();
    await expect(page.getByRole('heading', { name: 'Все блоки', level: 1 })).toBeVisible();
    await checkScreen(page, '«Все блоки»');
    await page.getByRole('link', { name: new RegExp(`^${link}`) }).click();
  }
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
}

/** Opens a block, checks what it shows, then — with the content loaded — checks the screen itself. */
async function visit(page: Page, block: Block, when: string, expectations: () => Promise<void>) {
  await openBlock(page, block);
  await expectations();
  await checkScreen(page, `${when}, «${BLOCKS[block].link}»`);
}

async function openToday(page: Page) {
  await page
    .getByRole('navigation', { name: 'Модули' })
    .getByRole('link', { name: /Сегодня/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Сегодня', level: 1 })).toBeVisible();
  await expect(page.getByText(/^Цели дня/)).toBeVisible();
  await checkScreen(page, '«Сегодня»');
}

/** «Утро» of a new day: the app is opened again at that time. */
async function goToDay(page: Page, now: Date) {
  await page.clock.setFixedTime(now);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Сегодня', level: 1 })).toBeVisible();
}

async function setUpBlocks(page: Page) {
  await openBlock(page, 'nutrition');
  await page.getByLabel('Вес, кг').fill('80');
  await page.getByRole('button', { name: 'Записать' }).click();
  await expect(page.getByText('Записано: 80 кг')).toBeVisible();
  await page.getByLabel('Рост, см').fill('180');
  await page.getByLabel('Год рождения').fill('1996');
  await page.getByRole('button', { name: 'Сохранить данные' }).click();
  await page.getByRole('radio', { name: 'Снизить' }).click();
  await page.getByRole('button', { name: 'Сохранить цель' }).click();
  await expect(page.getByText('Цель сохранена')).toBeVisible();

  await openBlock(page, 'training');
  await page.getByRole('button', { name: 'Шаблон: Сила 3 раза в неделю' }).click();
  await page.getByRole('button', { name: 'Сохранить программу' }).click();
  await expect(page.getByRole('list', { name: 'Сессия на сегодня' })).toContainText('Румынская тяга');

  await openBlock(page, 'habits');
  for (const [name, essential] of [
    ['Чтение', true],
    ['Зарядка', false],
  ] as const) {
    await page.getByRole('button', { name: '+ Привычка' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новая привычка' });
    await dialog.getByLabel('Название').fill(name);
    if (essential) await dialog.getByRole('checkbox', { name: /Ключевая/ }).check();
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('button', { name: `Отметить «${name}»` })).toBeVisible();
  }
}

async function createExamTomorrow(page: Page) {
  await openToday(page);
  await page.getByRole('link', { name: /События/ }).click();
  await checkScreen(page, '«События»');
  await page.getByRole('button', { name: 'Добавить событие' }).click();
  const form = page.getByRole('dialog', { name: 'Новое событие' });
  await form.getByLabel('Название').fill('IELTS');
  await form.getByLabel('Тип').selectOption('exam');
  await form.getByLabel('Дата').fill('2026-11-05');
  await form.getByRole('radio', { name: 'Критичное' }).click();
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('region', { name: 'Предстоящие' }).getByRole('link', { name: /IELTS/ })).toBeVisible();
  await checkScreen(page, '«События» с экзаменом');
}

const mindPlan = (page: Page) => page.getByText(/^Сегодня (\d+ мин|без тренажёров)/);

test('Given чистое приложение When я создаю экзамен на завтра Then «Питание» без дефицита, «Тренировки» — разгрузка, «Медитация» — дыхание, «Ум» ≤ 5 мин, «Привычки» — только ключевые, «Прогресс» — квесты дня события', async ({
  page,
}) => {
  test.setTimeout(90_000);
  problems.length = 0;
  await page.clock.setFixedTime(DAY_BEFORE);
  await skipOnboarding(page);
  await setUpBlocks(page);

  await test.step('Без события: обычный день во всех блоках', async () => {
    await visit(page, 'nutrition', 'обычный день', async () => {
      await expect(page.getByRole('progressbar', { name: 'Калории' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Цель на день' })).toContainText('0 / 2050 ккал');
      await expect(page.getByText('Сегодня без дефицита')).toHaveCount(0);
    });

    await visit(page, 'training', 'обычный день', async () => {
      await expect(page.getByText('Разгрузка: вес и объём −40%')).toHaveCount(0);
    });

    await visit(page, 'meditation', 'обычный день', async () => {
      await expect(page.getByText('Сегодня: 10 мин, фокус')).toBeVisible();
    });

    await visit(page, 'mind', 'обычный день', async () => {
      await expect(mindPlan(page)).toHaveText('Сегодня 10 мин: n-back 5 мин, Струп 5 мин');
    });

    await visit(page, 'habits', 'обычный день', async () => {
      await expect(page.getByText('Сегодня не считаются')).toHaveCount(0);
    });

    await visit(page, 'progress', 'обычный день', async () => {
      await page.getByRole('radio', { name: 'Квесты' }).click();
      await expect(page.getByRole('list', { name: 'Квесты дня' })).toContainText('4 фокус-сессии');
    });
  });

  await createExamTomorrow(page);
  await openToday(page);
  await expect(page.getByRole('link', { name: 'IELTS завтра · Разгрузка' })).toBeVisible();

  await test.step('Накануне экзамена: «Питание» без дефицита, «Тренировки» — разгрузка, «Ум» ≤ 5 мин', async () => {
    await visit(page, 'nutrition', 'накануне', async () => {
      const banner = page.getByRole('status').filter({ hasText: 'Сегодня без дефицита' });
      await expect(banner).toContainText('Завтра «IELTS»');
      await expect(page.getByRole('region', { name: 'Цель на день' })).toContainText('0 / 2490 ккал');
    });

    await visit(page, 'training', 'накануне', async () => {
      await expect(page.getByText('Разгрузка: вес и объём −40%')).toBeVisible();
      await expect(page.getByRole('list', { name: 'Сессия на сегодня' })).toContainText('Румынская тяга: 2 × 8');
      const plan = page.getByRole('list', { name: 'План на 2 недели' });
      await expect(plan.getByRole('listitem', { name: /5 ноября/ })).toContainText('День отдыха');
    });

    await visit(page, 'mind', 'накануне', async () => {
      await expect(mindPlan(page)).toHaveText('Сегодня 5 мин: Струп 5 мин');
    });
  });

  await goToDay(page, EXAM_DAY);
  await expect(page.getByRole('link', { name: 'IELTS сегодня · День события' })).toBeVisible();

  await test.step('В день экзамена: «Медитация» — дыхание, «Привычки» — только ключевые, «Прогресс» — квесты дня события, «Ум» ≤ 5 мин, «Питание» без дефицита', async () => {
    await visit(page, 'meditation', 'день экзамена', async () => {
      await expect(page.getByText('Сегодня: 10 мин, дыхание')).toBeVisible();
    });

    await visit(page, 'habits', 'день экзамена', async () => {
      await expect(page.getByRole('button', { name: 'Отметить «Чтение»' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Отметить «Зарядка»' })).toHaveCount(0);
      await expect(page.getByText('Сегодня не считаются')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Открыть «Зарядка»' })).toContainText('серия сохранена');
      await expect(page.getByText('Только ключевые привычки, дыхательная медитация перед событием')).toBeVisible();
    });

    await visit(page, 'progress', 'день экзамена', async () => {
      await page.getByRole('radio', { name: 'Квесты' }).click();
      const quests = page.getByRole('list', { name: 'Квесты дня' }).getByRole('listitem');
      await expect(quests).toHaveCount(2);
      await expect(quests.nth(0)).toContainText('Ключевые привычки');
      await expect(quests.nth(1)).toContainText('Дыхание 5 мин');
      await expect(page.getByText('День события: только ключевые привычки и дыхание, без тренировок.')).toBeVisible();
    });

    await visit(page, 'mind', 'день экзамена', async () => {
      await expect(mindPlan(page)).toHaveText('Сегодня 5 мин: Струп 5 мин');
    });

    await visit(page, 'nutrition', 'день экзамена', async () => {
      await expect(page.getByRole('status').filter({ hasText: 'Сегодня без дефицита' })).toContainText(
        'Сегодня «IELTS»',
      );
    });
  });

  await test.step('Given экран 360×740 When я прохожу сценарий Then ни одна кнопка не перекрыта, нижняя панель ведёт во все блоки', async () => {
    expect(page.viewportSize()).toEqual({ width: 360, height: 740 });
    // Every block above was opened only through the bottom bar (`openBlock`), and `visit` checked each screen.
    expect(problems).toEqual([]);
  });

  await test.step('Given время зафиксировано `page.clock` When сценарий прогоняется Then результаты детерминированы', async () => {
    // Determinism is in the exact values asserted above (2050 → 2490 ккал, 2 × 8, 10 → 5 мин, the dates of the
    // plan) — they hold only for the fixed days. Here: the clock does not move while the scenario runs, and the
    // same morning opened again gives the same day.
    await page.goto('/');
    await expect(page.getByText('Цели дня · День события')).toBeVisible();
    expect(await page.evaluate(() => Date.now())).toBe(EXAM_DAY.getTime());
    await page.reload();
    await expect(page.getByRole('link', { name: 'IELTS сегодня · День события' })).toBeVisible();
    expect(await page.evaluate(() => Date.now())).toBe(EXAM_DAY.getTime());
  });
});
