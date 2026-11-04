import { expect, test, type Locator } from '@playwright/test';

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element is not visible');
  return b;
}

test('Given страница модуля передаёт actions в Page When экран 360 px Then кнопка действий не перекрывается ссылкой «Настройки», обе ≥ 44 px', async ({
  page,
}) => {
  for (const path of ['/#/tasks', '/#/habits', '/#/time', '/#/health']) {
    await page.goto(path);
    const header = page.locator('section > header').first();
    await expect(header.getByRole('heading', { level: 1 })).toBeVisible();
    // Stand-in for the `actions` slot (no module passes `actions` yet): a 44 × 44 button at the right
    // end of the Page header. Replace with the real button once `time` moves «+ Запись» back (#51 follow-up).
    await header.evaluate((el) => {
      const action = document.createElement('button');
      action.textContent = '+';
      action.setAttribute('aria-label', 'Действие');
      action.style.cssText = 'min-width:44px;min-height:44px;flex-shrink:0';
      // Where `actions` render: the right-hand group, before ⚙️.
      el.querySelector('div')!.prepend(action);
    });
    const action = await box(header.getByRole('button', { name: 'Действие' }));
    const settings = await box(page.getByRole('link', { name: 'Настройки' }));

    expect(action.width).toBeGreaterThanOrEqual(44);
    expect(action.height).toBeGreaterThanOrEqual(44);
    expect(settings.width).toBeGreaterThanOrEqual(44);
    expect(settings.height).toBeGreaterThanOrEqual(44);
    expect(overlaps(action, settings), `${path}: action under ⚙️`).toBe(false);
    // The action is really tappable: the topmost element at its centre is the action itself.
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label'), {
      x: action.x + action.width / 2,
      y: action.y + action.height / 2,
    });
    expect(hit).toBe('Действие');
  }
});

test('Given любой экран с Tabs When он отображается на 360 px Then высота каждой вкладки ≥ 44 px', async ({ page }) => {
  for (const path of ['/#/tasks', '/#/time', '/#/health']) {
    await page.goto(path);
    const tabs = page.getByRole('navigation', { name: 'Разделы' }).getByRole('link');
    await expect(tabs.first()).toBeVisible();
    for (const tab of await tabs.all()) {
      const b = await tab.boundingBox();
      expect(b?.height, `${path}: ${await tab.textContent()}`).toBeGreaterThanOrEqual(44);
    }
  }
});

test('Given длинный список When я прокручиваю экран 360 px Then ⚙️ не перекрывает кнопки строк', async ({ page }) => {
  await page.goto('/#/tasks');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // A long page: tall filler after the header, so the page can scroll past the header.
  await page
    .locator('section')
    .first()
    .evaluate((el) => {
      const filler = document.createElement('div');
      filler.style.height = '3000px';
      el.append(filler);
    });
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  // The link lives in the Page header and scrolls away with it instead of floating over the rows.
  await expect(page.locator('section > header').first().getByRole('link', { name: 'Настройки' })).toHaveCount(1);
  const settings = await page.getByRole('link', { name: 'Настройки' }).boundingBox();
  expect(settings === null || settings.y + settings.height <= 0).toBe(true);
});

test('Given index.html When приложение открыто на телефоне Then в meta viewport есть viewport-fit=cover', async ({
  page,
}) => {
  await page.goto('/#/tasks');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});

test('Given 12 модулей When я открываю приложение на 360 px Then нижняя панель: «Сегодня», до трёх закреплённых и «Блоки»; кнопки ≥ 44 px, подписи не обрезаны', async ({
  page,
}) => {
  await page.goto('/#/tasks');
  const nav = page.getByRole('navigation', { name: 'Модули' });
  const links = nav.getByRole('link');
  await expect(links).toHaveText([/Сегодня/, /Задачи/, /Привычки/, /Время/, /Блоки/]);
  for (const link of await links.all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    // Not truncated: the label fits its box.
    expect(await link.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }

  await nav.getByRole('link', { name: /Блоки/ }).click();
  await expect(page.getByRole('heading', { name: 'Все блоки', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Питание/ })).toContainText('скоро');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
