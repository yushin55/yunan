import { chromium, expect } from '@playwright/test';

const origin = process.env.YUNAN_UI_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    localStorage.setItem('yunan:briefing-seen', '1');
    window.__audioRamps = [];
    window.__spoken = [];
    window.__voicesReady = false;
    window.__voiceQueries = 0;

    const ramp = AudioParam.prototype.exponentialRampToValueAtTime;
    AudioParam.prototype.exponentialRampToValueAtTime = function (value, time) {
      window.__audioRamps.push(value);
      return ramp.call(this, value, time);
    };

    class MockUtterance {
      constructor(text) { this.text = text; }
    }
    const events = new EventTarget();
    const voices = [
      { lang: 'ko-KR', name: 'Korean Heami Female' },
      { lang: 'ko-KR', name: 'Korean InJoon Male' },
    ];
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => {
          window.__voiceQueries++;
          if (window.__voiceQueries >= 2 && !window.__voicesReady && !window.__voiceTimer) {
            window.__voiceTimer = setTimeout(() => window.__loadVoices(), 100);
          }
          return window.__voicesReady ? voices : [];
        },
        addEventListener: (...args) => events.addEventListener(...args),
        removeEventListener: (...args) => events.removeEventListener(...args),
        resume: () => {},
        cancel: () => {},
        speak: (utterance) => window.__spoken.push({
          text: utterance.text,
          voice: utterance.voice?.name,
          voicesReady: window.__voicesReady,
          pitch: utterance.pitch,
          rate: utterance.rate,
        }),
      },
    });
    window.__loadVoices = () => {
      window.__voicesReady = true;
      events.dispatchEvent(new Event('voiceschanged'));
    };
  });

  const page = await context.newPage();
  // The generated file is the normal path; verify the browser voice fallback
  // separately when a clip cannot be loaded.
  await page.route('**/audio/narration/*.mp3', (route) => route.abort());
  await page.goto(`${origin}/practice`);
  await page.getByRole('button', { name: '연습 게임 시작' }).click();
  await expect(page.getByTestId('cinematic-reveal')).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.__spoken.filter((entry) => entry.text.trim()).length)).toBeGreaterThan(0);

  const audio = await page.evaluate(() => ({ spoken: window.__spoken, ramps: window.__audioRamps }));
  const narration = audio.spoken.find((entry) => entry.text.includes('오늘의 주제'));
  expect(narration.voice, 'the Korean male browser voice is selected when available').toBe('Korean InJoon Male');
  expect(narration.voicesReady, 'narration waits for asynchronously loaded voices').toBe(true);
  expect(narration.pitch).toBeLessThan(0.5);
  expect(narration.rate).toBeLessThan(0.8);
  expect(audio.ramps.some((value) => value >= 0.4), 'soundtrack master level should be audible').toBe(true);
  expect(audio.ramps.some((value) => value >= 0.17 && value <= 0.2), 'foreground motif should have audible output').toBe(true);
  expect(audio.ramps.some((value) => value >= 0.3 && value < 0.4), 'the score should include a strong low drum impact').toBe(true);

  console.log('PASS: dramatic score levels and delayed Korean male fallback when recorded audio is unavailable.');
  await context.close();

  const previewContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await previewContext.addInitScript(() => {
    localStorage.setItem('yunan:briefing-seen', '1');
    window.__recordedVoiceStarts = 0;
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.duration > 3) window.__recordedVoiceStarts++;
      return originalStart.apply(this, args);
    };
  });
  const previewPage = await previewContext.newPage();
  await previewPage.goto(`${origin}/practice`);
  await previewPage.getByRole('button', { name: '남성 내레이션 · 배경음 미리 듣기' }).click();
  await expect.poll(() => previewPage.evaluate(() => window.__recordedVoiceStarts)).toBeGreaterThan(0);
  const previewClip = await previewPage.evaluate(() => performance.getEntriesByType('resource')
    .some((entry) => entry.name.includes('/audio/narration/voice_test.mp3')));
  expect(previewClip, 'the explicit sound preview should use the bundled male narration').toBe(true);
  await previewContext.close();
  console.log('PASS: lobby preview plays a bundled male voice clip.');
} finally {
  await browser.close();
}
