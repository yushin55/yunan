import { chromium, devices, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Needs only the web server: the practice mode runs without the API or Firebase.
const origin = process.env.BRIDGE_UI_URL || 'http://localhost:5173';
// SwiftShader gives headless Chromium a software WebGL context for the 3D table.
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
await mkdir('artifacts', { recursive: true });

// Watch the issue briefing to the end (stepping through scenes), then read the rules.
async function brief(page) {
  await page.getByTestId('briefing-play').click();
  // The anchor segment starts after the opening title card.
  await expect(page.getByTestId('briefing-headline')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.getByTestId('briefing').screenshot({ path: `artifacts/briefing-${page.viewportSize().width}.png` });
  for (let i = 0; i < 8 && (await page.getByTestId('briefing-next').count()); i++) await page.getByTestId('briefing-next').click();
  await page.getByTestId('briefing-done').click();
  // The rules video, stepped through scene by scene, unlocks role picking.
  await page.getByTestId('rules-play').click();
  for (let i = 0; i < 10 && !(await page.getByTestId('rules-done').isEnabled()); i++) {
    await page.getByTestId('briefing-next').click({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.getByTestId('rules-done').click();
}

// Dressing-room picker: show a role from the rack, put it in the next slot, then confirm.
async function pickRoles(page, indices) {
  for (const i of indices) {
    await page.locator('.rack-item').nth(i).click();
    await page.getByTestId('wardrobe-add').click();
  }
  await page.getByTestId('wardrobe-submit').click();
}

async function play(label, options) {
  const errors = [];
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // A practice game must not reach the API or Firebase.
  page.on('request', (r) => {
    if (/:(8000|8080|9099)\/|identitytoolkit|firestore\.googleapis/.test(r.url())) errors.push(`network: ${r.url()}`);
  });
  const title = page.getByTestId('phase-pill');
  // A name plate that is on screen right now (plates outside the view are hidden).
  const plate = () => page.locator('.table-label[style*="opacity: 1"]').first();

  await page.goto(origin);
  await page.getByTestId('practice-link').click();
  // Pick a topic card, press start, then give a nickname to enter the room.
  await expect(page.getByTestId('practice-start-setup')).toBeDisabled();
  await page.getByRole('radio', { name: /학교 내 CCTV/ }).click();
  await page.screenshot({ path: `artifacts/practice-${label}-topics.png` });
  await page.getByTestId('practice-start-setup').click();
  await page.getByRole('textbox', { name: '닉네임' }).fill('연습생');
  await page.getByTestId('practice-begin').click();
  await expect(page.getByTestId('flow-overlay')).toBeVisible(); // Briefing, rules and roles fill the screen.

  await expect(title).toContainText('대기실');
  await expect(page.getByTestId('practice-start')).toBeDisabled();
  await expect(page.getByTestId('briefing-done')).toBeDisabled(); // Roles come after the briefing.
  await page.screenshot({ path: `artifacts/practice-${label}-lobby.png` });
  await brief(page);
  await page.screenshot({ path: `artifacts/practice-${label}-wardrobe.png` });
  await pickRoles(page, [0, 1]);
  await page.getByTestId('practice-start').click();

  await expect(title).toContainText('역할 확인');
  await expect(page.getByTestId('table-view')).toBeVisible();
  await expect(page.locator('.table-label')).toHaveCount(5); // Five partners sit around the table.
  await expect(page.getByTestId('identity')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `artifacts/practice-${label}-role.png` });
  // Nothing may push the page sideways (the status bar must fit on a phone).
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '역할을 확인했어요' }).click();
  // Partners confirm within seconds; the phase moves on without the stand-in teacher.
  await expect(title).toContainText('입장 발표', { timeout: 15000 });

  await page.getByLabel(/이 주제에 대해 어떻게 생각하나요/).fill('닥쳐');
  await page.getByRole('button', { name: '발표하기' }).click();
  await expect(page.getByTestId('moderation-notice')).toContainText('표현을 다듬어 주세요');
  await page.getByLabel(/이 주제에 대해 어떻게 생각하나요/).fill('저는 제 역할로서 학생의 사생활도 함께 지켜야 한다고 생각합니다.');
  await page.getByRole('button', { name: '발표하기' }).click();
  await expect(title).toContainText('사건·질문', { timeout: 40000 });
  await expect(page.locator('.event-card')).toBeVisible();

  // Tapping someone at the table makes them the recipient and opens the chat tab.
  await plate().getByRole('button').click();
  await page.getByRole('radio', { name: '질문' }).click();
  await expect(page.getByLabel('받는 사람')).not.toHaveValue('');
  await page.getByLabel('질문 입력').fill('진짜 그렇게 생각하세요?');
  await page.getByRole('button', { name: '보내기' }).click();
  // The asked partner answers, and others respond to the event card.
  await expect(page.locator('.chat-message.kind-answer')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('.chat-message.kind-response').first()).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('table-bubble').first()).toBeAttached({ timeout: 30000 });
  await page.screenshot({ path: `artifacts/practice-${label}-event.png` });

  await page.getByTestId('practice-next').click();
  await expect(title).toContainText('반론');
  await page.getByLabel('반론 입력').fill('그 걱정은 이해하지만 안전도 중요해요.');
  await page.getByRole('button', { name: '보내기' }).click();
  await page.getByTestId('practice-next').click();

  await expect(title).toContainText('투표');
  await plate().getByRole('button').click(); // Picking at the table selects the candidate.
  await expect(page.locator('.candidate.picked')).toHaveCount(1);
  await page.getByRole('button', { name: '이대로 투표하기' }).click();
  await expect(page.getByTestId('reveal')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.switcher-name strong')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText(/1순위|2순위|최종 의견|진짜 의견/);
  await page.screenshot({ path: `artifacts/practice-${label}-reveal.png` });

  await page.reload();
  await expect(page.getByTestId('reveal')).toBeVisible(); // Saved in this browser.
  await page.getByRole('button', { name: '게임 종료' }).click();
  await expect(title).toContainText('게임 종료');
  await context.close();
  if (errors.length) throw new Error(errors.join(' | '));
  console.log(`PASS practice (${label})`);
}

try {
  await play('mobile', { ...devices['Pixel 7'] });
  await play('desktop', { viewport: { width: 1440, height: 900 } });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
