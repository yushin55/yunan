import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const origin = process.env.YUNAN_UI_URL || 'http://localhost:5173';
const errors = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

await mkdir('artifacts', { recursive: true });

async function openPractice(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('yunan:briefing-seen', '1'));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/practice`);
  await expect(page.getByTestId('immersive-room')).toBeVisible();
  await expect(page.getByTestId('immersive-world').locator('canvas')).toBeVisible({ timeout: 20000 });
  return { page, context };
}

function viewportCoverage(rect, viewport) {
  return {
    width: rect.width / viewport.width,
    height: rect.height / viewport.height,
  };
}

try {
  const desktopViewport = { width: 1440, height: 900 };
  const desktop = await openPractice(desktopViewport);
  const world = desktop.page.getByTestId('immersive-world');
  const worldBox = await world.boundingBox();
  expect(worldBox).not.toBeNull();
  const coverage = viewportCoverage(worldBox, desktopViewport);
  expect(coverage.width, '3D world should fill the desktop width').toBeGreaterThan(0.9);
  expect(coverage.height, '3D world should fill the desktop height').toBeGreaterThan(0.8);

  const scene = desktop.page.locator('.immersive-scene');
  await expect(scene).toBeVisible();
  const opponents = scene.locator('.immersive-scene__name[data-player-uid]');
  await expect(opponents.first()).toBeVisible();
  expect(await opponents.count(), 'Other players should be represented by selectable in-world characters').toBeGreaterThanOrEqual(3);
  const selectedUid = await opponents.first().getAttribute('data-player-uid');
  await opponents.first().click();
  await expect(desktop.page.getByTestId('immersive-focus')).toBeVisible();
  expect(await desktop.page.getByTestId('immersive-focus').textContent()).toBeTruthy();

  await desktop.page.screenshot({ path: 'artifacts/immersive-desktop.png' });

  await desktop.page.getByRole('button', { name: '연습 게임 시작' }).click();
  await desktop.page.getByTestId('cinematic-reveal').getByRole('button', { name: '연출 닫고 테이블 보기' }).click();
  const desktopStage = desktop.page.getByTestId('immersive-action-tray');
  await expect(desktopStage, 'The phase card should appear as soon as the reveal closes').toBeVisible();
  await expect(desktopStage.locator('.action-panel h2')).toHaveText('오늘의 주제');
  await expect(desktop.page.getByRole('button', { name: /카드 접기|진행 카드 펼치기/ })).toHaveCount(0);
  await desktopStage.getByRole('button', { name: '내 생각 선택하기' }).click();
  await expect(desktopStage.getByTestId('deck-choice')).toBeVisible();
  await expect(desktopStage.locator('.tarot-echo')).toHaveCount(2);
  await expect(desktopStage.locator('.tarot-echo--previous')).toBeVisible();
  await expect(desktopStage.locator('.tarot-echo--next')).toBeVisible();

  const mobileViewport = { width: 390, height: 844 };
  const mobile = await openPractice(mobileViewport);
  const mobileWorldBox = await mobile.page.getByTestId('immersive-world').boundingBox();
  expect(mobileWorldBox).not.toBeNull();
  const mobileCoverage = viewportCoverage(mobileWorldBox, mobileViewport);
  expect(mobileCoverage.width, '3D world should fill the mobile width').toBeGreaterThan(0.9);
  expect(mobileCoverage.height, '3D world should fill the mobile height').toBeGreaterThan(0.8);
  expect(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Immersive screen must not scroll horizontally on mobile').toBe(true);
  await expect(mobile.page.locator('.immersive-scene__name[data-player-uid]').first()).toBeVisible();
  await mobile.page.screenshot({ path: 'artifacts/immersive-mobile.png' });

  await mobile.page.getByRole('button', { name: '연습 게임 시작' }).click();
  await mobile.page.getByTestId('cinematic-reveal').getByRole('button', { name: '연출 닫고 테이블 보기' }).click();
  const mobileTray = mobile.page.getByTestId('immersive-action-tray');
  await expect(mobileTray.locator('.action-panel h2')).toHaveText('오늘의 주제');
  await expect(mobile.page.getByRole('button', { name: /카드 접기|진행 카드 펼치기/ })).toHaveCount(0);
  await mobileTray.getByRole('button', { name: '내 생각 선택하기' }).click();
  await expect(mobileTray.getByTestId('deck-choice')).toBeVisible();
  await expect(mobileTray.locator('.tarot-echo--previous')).toBeVisible();
  await expect(mobileTray.locator('.tarot-echo--next')).toBeVisible();
  expect(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'The visible three-card selection must not scroll horizontally on mobile').toBe(true);

  expect(errors, 'No uncaught JavaScript errors').toEqual([]);
  console.log(`PASS: seated 3D world covers desktop/mobile viewport; opponents selectable; three-card phase selection appears without opening a tray; no page errors. Selected ${selectedUid}.`);
  await desktop.context.close();
  await mobile.context.close();
} finally {
  await browser.close();
}
