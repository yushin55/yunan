import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const origin = process.env.YUNAN_UI_URL || 'http://localhost:5173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const errors = [];
await mkdir('artifacts', { recursive: true });

async function openPractice(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('yunan:briefing-seen', '1');
    window.__spoken = [];
    window.__oscillators = 0;
    window.__narrationSources = [];
    window.__audioContexts = [];
    window.__audioOutputs = [];
    if (window.AudioContext) {
      const createOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (...args) {
        window.__oscillators++;
        if (!window.__audioContexts.includes(this)) window.__audioContexts.push(this);
        return createOscillator.apply(this, args);
      };
      const createGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function (...args) {
        const gain = createGain.apply(this, args);
        const connect = gain.connect.bind(gain);
        gain.connect = (destination, ...rest) => {
          if (destination === this.destination) window.__audioOutputs.push(gain);
          return connect(destination, ...rest);
        };
        return gain;
      };
    }
    const startBuffer = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.duration > 3) window.__narrationSources.push(this.buffer.duration);
      return startBuffer.apply(this, args);
    };
    class MockUtterance {
      constructor(text) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => window.__mockVoices,
        addEventListener: (name, listener) => { if (name === 'voiceschanged') window.__voiceListeners.add(listener); },
        removeEventListener: (name, listener) => { if (name === 'voiceschanged') window.__voiceListeners.delete(listener); },
        resume: () => {},
        cancel: () => {},
        speak: (utterance) => window.__spoken.push({ text: utterance.text, lang: utterance.lang, pitch: utterance.pitch, rate: utterance.rate, voice: utterance.voice?.name }),
      },
    });
    window.__mockVoices = [{ lang: 'ko-KR', name: 'Korean Male test voice' }];
    window.__voiceListeners = new Set();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/practice`);
  await expect(page.getByTestId('immersive-world').locator('canvas')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: '연습 게임 시작' }).click();
  return { page, context };
}

async function checkTopicReveal(page, viewport, screenshot) {
  const reveal = page.getByTestId('cinematic-reveal');
  await expect(reveal).toBeVisible({ timeout: 20000 });
  await expect(reveal.getByTestId('cinematic-title')).not.toBeEmpty();
  const box = await reveal.boundingBox();
  expect(box, 'cinematic reveal should be measurable').not.toBeNull();
  expect(box.width / viewport.width, 'topic should occupy the screen width').toBeGreaterThan(0.95);
  expect(box.height / viewport.height, 'topic should occupy the screen height').toBeGreaterThan(0.95);
  const titleBox = await reveal.getByTestId('cinematic-title').boundingBox();
  expect(titleBox?.height, 'the title should read as a featured game reveal').toBeGreaterThanOrEqual(
    viewport.width < 700 ? 30 : 50);
  await expect.poll(() => page.evaluate(() => window.__narrationSources.length), {
    message: 'the phase transition should play its recorded Korean male narration',
  }).toBeGreaterThan(0);
  const clipRequests = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => entry.name).filter((name) => /\/audio\/narration\/topic_[^/]+\.mp3/.test(name)));
  expect(clipRequests.length, 'the built-in topic should use a local narration asset').toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__oscillators), {
    message: 'original Web Audio background score should start after the first game click',
  }).toBeGreaterThanOrEqual(4);
  await expect.poll(() => page.evaluate(() => window.__audioContexts.some((context) => context.state === 'running')), {
    message: 'the soundtrack AudioContext should be running after a user gesture',
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__audioOutputs.some((gain) => gain.gain.value > 0.2)), {
    message: 'the background score should have an audible output level',
  }).toBe(true);
  const beforeMusicRestart = await page.evaluate(() => window.__oscillators);
  await reveal.getByRole('button', { name: '배경음 끄기' }).click();
  await expect(reveal.getByRole('button', { name: '배경음 켜기' })).toHaveAttribute('aria-pressed', 'false');
  await reveal.getByRole('button', { name: '배경음 켜기' }).click();
  await expect.poll(() => page.evaluate(() => window.__oscillators), {
    message: 'turning the score back on should synthesize fresh music voices',
  }).toBeGreaterThan(beforeMusicRestart + 2);
  await page.screenshot({ path: screenshot });
  const beforeReplay = await page.evaluate(() => window.__narrationSources.length);
  await reveal.getByRole('button', { name: '음성 다시 듣기' }).click();
  await expect.poll(() => page.evaluate(() => window.__narrationSources.length), {
    message: 'replay should start the recorded narration again',
  }).toBeGreaterThan(beforeReplay);
}

try {
  const desktopViewport = { width: 1440, height: 900 };
  const desktop = await openPractice(desktopViewport);
  await checkTopicReveal(desktop.page, desktopViewport, 'artifacts/cinematic-topic-desktop.png');
  await desktop.page.getByTestId('cinematic-reveal').getByRole('button', { name: '나의 관점 정하기' }).click();
  await expect(desktop.page.getByTestId('cinematic-reveal')).toHaveCount(0);
  await expect(desktop.page.getByTestId('action-step')).toHaveCount(1);
  const desktopStage = desktop.page.getByTestId('immersive-action-tray');
  await expect(desktopStage, 'The choice stage should appear without an open-card action').toBeVisible();
  await expect(desktop.page.getByRole('button', { name: /카드 접기|진행 카드 펼치기/ })).toHaveCount(0);
  await expect(desktopStage.getByTestId('deck-choice')).toBeVisible();
  await expect(desktopStage.locator('.tarot-echo')).toHaveCount(2);
  await expect(desktopStage.locator('.tarot-echo--previous strong')).toBeVisible();
  await expect(desktopStage.locator('.tarot-echo--next strong')).toBeVisible();
  await desktop.page.screenshot({ path: 'artifacts/cinematic-card-desktop.png' });
  await desktopStage.locator('.tarot-echo--next').click();
  await expect(desktopStage.locator('.deck-choice.is-selected')).toBeVisible();

  const mobileViewport = { width: 390, height: 844 };
  const mobile = await openPractice(mobileViewport);
  await checkTopicReveal(mobile.page, mobileViewport, 'artifacts/cinematic-topic-mobile.png');
  expect(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'the mobile cinematic must fit the viewport').toBe(true);
  await mobile.page.getByTestId('cinematic-reveal').getByRole('button', { name: '나의 관점 정하기' }).click();
  await expect(mobile.page.getByTestId('action-step')).toHaveCount(1);
  await expect(mobile.page.getByTestId('deck-choice')).toBeVisible();
  await expect(mobile.page.locator('.tarot-echo--previous strong')).toBeVisible();
  await expect(mobile.page.locator('.tarot-echo--next strong')).toBeVisible();
  await expect(mobile.page.getByRole('button', { name: /카드 접기|진행 카드 펼치기/ })).toHaveCount(0);
  await expect(mobile.page.getByRole('button', { name: '배경음 끄기' })).toBeVisible();
  expect(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'three visible cards must fit the mobile viewport').toBe(true);
  await mobile.page.screenshot({ path: 'artifacts/cinematic-card-mobile.png' });
  await mobile.page.getByTestId('deck-next').click();
  await mobile.page.getByTestId('deck-select').click();
  await mobile.page.getByTestId('action-next').click();
  await expect(mobile.page.getByTestId('action-step')).toHaveAttribute('data-step', '1');
  await mobile.page.getByTestId('action-back').click();
  await expect(mobile.page.getByTestId('action-step')).toHaveAttribute('data-step', '0');

  expect(errors, 'no uncaught JavaScript errors').toEqual([]);
  console.log('PASS: full-screen narrated topic reveal, voice replay, immediate three-card selection, mobile fit.');
  await desktop.context.close();
  await mobile.context.close();
} finally {
  await browser.close();
}
