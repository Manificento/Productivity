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
    // Stand-in for the `actions` slot: a 44 × 44 button at the right end of the Page header.
    await header.evaluate((el) => {
      const action = document.createElement('button');
      action.textContent = '+';
      action.setAttribute('aria-label', 'Действие');
      action.style.cssText = 'min-width:44px;min-height:44px;flex-shrink:0';
      el.append(action);
    });
    const action = await box(header.getByRole('button', { name: 'Действие' }));
    const settings = await box(page.getByRole('link', { name: 'Настройки' }));

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
