import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const origin = process.env.YUNAN_UI_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];
await mkdir('artifacts', { recursive: true });

const loadedClips = (page) => page.evaluate(() => performance.getEntriesByType('resource')
  .map((entry) => entry.name.split('/').pop())
  .filter((name) => name.startsWith('briefing_')));

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/practice`);

  // First visit: the briefing waits behind a gate so the click can start the sound.
  const briefing = page.getByTestId('rule-briefing');
  await expect(briefing).toBeVisible({ timeout: 20000 });
  await briefing.getByRole('button', { name: /게임 설명 듣기/ }).click();
  await expect(page.getByTestId('briefing-counter')).toHaveText('RULE 01 / 10');
  await expect.poll(() => loadedClips(page), { timeout: 10000 }).toContain('briefing_intro.mp3');

  // The chapter advances by itself when the narrated line ends, and the next line is preloaded.
  await expect(page.getByTestId('briefing-counter')).toHaveText('RULE 02 / 10', { timeout: 20000 });
  expect(await loadedClips(page)).toContain('briefing_table.mp3');

  // Let the whole narration run untouched: record every chapter change until it closes itself.
  await page.evaluate(() => {
    window.__chapters = [];
    const read = () => {
      const text = document.querySelector('[data-testid="briefing-counter"]')?.textContent;
      if (text && window.__chapters.at(-1) !== text) window.__chapters.push(text);
    };
    read();
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await expect(briefing).toHaveCount(0, { timeout: 160000 });
  const chapters = await page.evaluate(() => window.__chapters);
  expect(chapters).toEqual(Array.from({ length: 9 }, (_, i) => `RULE ${String(i + 2).padStart(2, '0')} / 10`));
  expect((await loadedClips(page)).length, 'every chapter used its bundled clip').toBeGreaterThanOrEqual(10);

  // Seen once: no gate on reload, but the lobby can replay it directly.
  await page.reload();
  await expect(page.getByTestId('immersive-world').locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(briefing).toHaveCount(0);
  await page.getByRole('button', { name: /게임 설명 듣기/ }).click();
  await expect(page.getByTestId('briefing-counter')).toHaveText('RULE 01 / 10');
  await briefing.getByRole('button', { name: /설명 건너뛰기/ }).click();
  await expect(briefing).toHaveCount(0);
  await context.close();

  // Reduced motion shows each chapter's finished simulation, which is what the captures check.
  const still = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const desk = await still.newPage();
  desk.on('pageerror', (error) => errors.push(error.message));
  await desk.goto(`${origin}/practice`);
  const deskBriefing = desk.getByTestId('rule-briefing');
  await deskBriefing.getByRole('button', { name: /게임 설명 듣기/ }).click();
  const scenes = ['intro', 'table', 'initial', 'role', 'claim', 'question', 'guess', 'reveal', 'score', 'outro'];
  for (const [i, scene] of scenes.entries()) {
    if (i) await deskBriefing.getByRole('button', { name: '다음 설명' }).click();
    await expect(deskBriefing.locator(`[data-scene="${scene}"]`)).toBeVisible();
    await desk.screenshot({ path: `artifacts/briefing-${String(i + 1).padStart(2, '0')}-${scene}.png` });
  }
  await deskBriefing.getByRole('button', { name: '테이블로 돌아가기' }).click();
  await expect(deskBriefing).toHaveCount(0);
  await still.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const phone = await mobile.newPage();
  phone.on('pageerror', (error) => errors.push(error.message));
  await phone.goto(`${origin}/practice`);
  await phone.getByTestId('rule-briefing').getByRole('button', { name: /게임 설명 듣기/ }).click();
  for (let i = 0; i < 3; i++) await phone.getByRole('button', { name: '다음 설명' }).click();
  await expect(phone.locator('[data-scene="role"]')).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll on mobile').toBe(true);
  await phone.screenshot({ path: 'artifacts/briefing-mobile-role.png' });
  await mobile.close();

  expect(errors, 'No uncaught JavaScript errors').toEqual([]);
  console.log('PASS: first-visit rule briefing, narrated auto-advance with preloading, all chapters, replay from lobby, mobile fit.');
} finally {
  await browser.close();
}
