// Renders the PWA icons from public/icons/icon.svg with the Playwright Chromium already used for e2e.
// Run after changing the SVG: node scripts/generate-icons.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = (name) => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url));
const svg = readFileSync(dir('icon.svg'), 'utf8');
const BG = '#4f46e5';

/** `inset` < 1 shrinks the mark into the maskable safe zone on a full-bleed background. */
const ICONS = [
  { file: dir('pwa-192.png'), size: 192, inset: 1, round: true },
  { file: dir('pwa-512.png'), size: 512, inset: 1, round: true },
  { file: dir('pwa-maskable-192.png'), size: 192, inset: 0.8, round: false },
  { file: dir('pwa-maskable-512.png'), size: 512, inset: 0.8, round: false },
  { file: dir('apple-touch-icon.png'), size: 180, inset: 1, round: false },
];

const browser = await chromium.launch({ channel: 'chrome' }); // same browser as e2e (playwright.config.ts)
const page = await browser.newPage();
for (const { file, size, inset, round } of ICONS) {
  const mark = round ? svg : svg.replace(/rx="\d+"/, 'rx="0"');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:${round ? 'transparent' : BG};display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${size * inset}px;height:${size * inset}px">${mark.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: round });
  console.log(file);
}
await browser.close();
