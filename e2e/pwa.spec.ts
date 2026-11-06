import { expect, test } from '@playwright/test';

test('Given сборка When проверяется манифест Then есть PNG-иконки 192 и 512 (обычная и maskable) и apple-touch-icon', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url()).toString();
  const manifest = (await (await request.get(manifestUrl)).json()) as {
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  const png = (size: string, purpose: string) =>
    manifest.icons.find((i) => i.type === 'image/png' && i.sizes === size && (i.purpose ?? 'any') === purpose);
  const wanted = [png('192x192', 'any'), png('512x512', 'any'), png('192x192', 'maskable'), png('512x512', 'maskable')];
  expect(wanted.every(Boolean)).toBe(true);

  // Every icon really is a PNG of the declared size.
  for (const icon of wanted) {
    const res = await request.get(new URL(icon!.src, manifestUrl).toString());
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('image/png');
    const body = await res.body();
    const side = body.readUInt32BE(16); // PNG IHDR width
    expect(`${side}x${side}`).toBe(icon!.sizes);
  }

  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const res = await request.get(new URL(apple!, page.url()).toString());
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('image/png');
  expect((await res.body()).readUInt32BE(16)).toBe(180);
});

test('Given Chrome на Android When сайт открыт Then доступна установка; в настройках есть кнопка «Установить», если браузер её поддерживает', async ({
  page,
}) => {
  await page.goto('/#/tasks');
  await expect(page.getByRole('heading', { name: 'Задачи', level: 1 })).toBeVisible();

  // Chrome itself finds the site installable (manifest, icons, service worker).
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  // Playwright's contexts are incognito-like; that is the test browser, not the app.
  expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito')).toEqual([]);

  // Headless Chrome does not run its install heuristics: stand in for its offer, on another page.
  await page.evaluate(() => {
    const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>;
    offer.prompt = () => Promise.resolve();
    offer.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(offer);
  });
  await page.getByRole('link', { name: 'Настройки' }).click();
  const install = page.getByRole('button', { name: 'Установить' });
  await expect(install).toBeVisible();
  expect((await install.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await install.click();
  await expect(page.getByText('Приложение установлено')).toBeVisible();
});

test('Given веб-сборка When я открываю PWA Then service worker регистрируется как раньше', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
  const script = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.active?.scriptURL ?? ''));
  expect(script).toMatch(/\/sw\.js$/);
});

test('Given приложение запущено в нативной оболочке When оно стартует Then service worker PWA не регистрируется', async ({
  page,
}) => {
  // What the Android WebView of the Capacitor shell injects; @capacitor/core then reports platform "android".
  await page.addInitScript(() => {
    (window as unknown as { androidBridge: object }).androidBridge = { postMessage: () => undefined };
  });
  const workerRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/sw.js')) workerRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
  // The web build fetches sw.js right after start; once the network is idle it would have happened.
  await page.waitForLoadState('networkidle');
  expect(workerRequests).toEqual([]);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(0);
});
