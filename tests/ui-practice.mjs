import { chromium, devices, expect as baseExpect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Many browsers on one machine can be slow; a late answer is not a failure.
const expect = baseExpect.configure({ timeout: 30000 });

// Needs only the web server: the practice mode runs without the API or Firebase.
const origin = process.env.BRIDGE_UI_URL || 'http://localhost:5173';
const device = process.env.BRIDGE_UI_DEVICE;
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
  for (let i = 0; i < 8 && !(await page.getByTestId('video-end').count()); i++) await page.getByTestId('briefing-next').click({ force: true });
  await page.getByTestId('video-next').click(); // The last frame offers replay or the next step.
  // The rules video, stepped through scene by scene, unlocks role picking.
  await page.getByTestId('rules-play').click();
  await page.getByTestId('video-skip').click({ force: true }); // Skipping jumps to the end screen.
  await page.getByTestId('video-next').click();
}

// Dressing-room picker: show a role from the rack, put it in the next slot, then confirm.
async function pickRoles(page, indices) {
  for (const i of indices) {
    await page.locator('.rack-item').nth(i).click();
    await page.getByTestId('wardrobe-add').click();
  }
  await page.getByTestId('wardrobe-submit').click();
}

// A slow machine must not lose the race against the game's clocks: this test moves the game on itself.
async function longTimers(page) {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('bridge.practice'));
    state.snapshot.room.settings.phaseSeconds = { role: 900, statement: 900, event: 900, rebuttal: 900, vote: 900 };
    state.snapshot.room.settings.micSeconds = 120;
    localStorage.setItem('bridge.practice', JSON.stringify(state));
  });
  await page.reload();
}

// A blocked or slow font server must not hold up the page's load event.
const noWebFonts = (context) => context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

async function play(label, options) {
  const errors = [];
  const context = await browser.newContext(options);
  await noWebFonts(context);
  const page = await context.newPage();
  // A stand-in for the browser's speech recognition, which headless Chromium does not have.
  await page.addInitScript(() => {
    class FakeRecognition {
      start() { window.__speech.current = this; }
      stop() {}
    }
    window.SpeechRecognition = FakeRecognition;
    window.__speech = {
      say(text) {
        const result = [{ transcript: text }];
        result.isFinal = true;
        this.current.onresult({ resultIndex: 0, results: [result] });
      },
    };
  });
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
  // Pick a topic card, press start, then give a name to enter the room.
  await expect(page.getByTestId('practice-start-setup')).toBeDisabled();
  await page.getByRole('radio', { name: /학교 내 CCTV/ }).click();
  await page.screenshot({ path: `artifacts/practice-${label}-topics.png` });
  await page.getByTestId('practice-start-setup').click();
  await page.getByRole('textbox', { name: '이름' }).fill('연습생');
  await page.getByTestId('practice-begin').click();
  await expect(page.getByTestId('flow-overlay')).toBeVisible(); // Briefing, rules and roles fill the screen.
  // Leaving the full-screen steps returns to the lobby, which offers to continue.
  await page.getByTestId('flow-exit').click();
  await expect(page.getByTestId('flow-resume')).toBeVisible();
  await page.getByRole('button', { name: /이어서 하기/ }).click();
  await expect(page.getByTestId('flow-overlay')).toBeVisible();

  await expect(title).toContainText('대기실');
  await expect(page.getByTestId('practice-start')).toHaveCount(0); // Start appears once roles are picked.
  await expect(page.getByTestId('briefing-done')).toBeDisabled(); // Roles come after the briefing.
  await page.screenshot({ path: `artifacts/practice-${label}-lobby.png` });
  await brief(page);
  await page.screenshot({ path: `artifacts/practice-${label}-wardrobe.png` });
  await expect(page.getByTestId('wardrobe-submit')).toBeInViewport(); // No scrolling to reach it.
  await pickRoles(page, [0, 1]);
  await expect(page.getByTestId('practice-start')).toBeInViewport();
  await longTimers(page);
  await expect(page.getByTestId('practice-start')).toBeInViewport();
  await page.getByTestId('practice-view-toggle').click();
  await expect(page.getByTestId('teacher-practice-note')).toBeVisible();
  await expect(page.getByTestId('participant-row')).toHaveCount(6);
  await expect(page.getByTestId('room-code')).toHaveCount(0);
  await page.getByRole('tab', { name: '주제와 설정' }).click(); // Topic and settings have their own section.
  await expect(page.getByRole('button', { name: '주제 바꾸기' })).toBeDisabled();
  await expect(page.getByRole('spinbutton').first()).toBeDisabled();
  await page.screenshot({ path: `artifacts/practice-${label}-teacher-lobby.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByTestId('practice-view-toggle').click();
  await page.screenshot({ path: `artifacts/practice-${label}-ready.png` });
  await page.getByTestId('practice-start').click();

  await expect(title).toContainText('역할 확인');
  await expect(page.getByTestId('table-view')).toBeVisible();
  await expect(page.locator('.table-label')).toHaveCount(5); // Five partners sit around the table.
  await expect(page.getByTestId('identity')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `artifacts/practice-${label}-role.png` });
  await page.getByTestId('practice-view-toggle').click();
  await expect(page.locator('.teacher-room')).toBeVisible();
  await expect(page.getByTestId('identity')).toHaveCount(0);
  await expect(page.locator('.role-chip')).toHaveCount(0);
  await expect(page.getByTestId('participant-row').first()).toContainText('비공개');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const paused = await page.evaluate(() => JSON.parse(localStorage.getItem('bridge.practice')));
  await page.waitForTimeout(1200);
  const stillPaused = await page.evaluate(() => JSON.parse(localStorage.getItem('bridge.practice')));
  expect(stillPaused.snapshot.room.paused).toBe(true);
  expect(stillPaused.schedule).toEqual(paused.schedule);
  await page.reload();
  await expect(page.locator('.teacher-room')).toBeVisible();
  await page.getByRole('button', { name: '1분 연장', exact: true }).click();
  const extended = await page.evaluate(() => JSON.parse(localStorage.getItem('bridge.practice')));
  expect(extended.snapshot.room.pausedRemainingMs).toBe(paused.snapshot.room.pausedRemainingMs + 60000);
  await page.getByRole('button', { name: '재개', exact: true }).click();
  await expect(page.getByRole('button', { name: '일시정지', exact: true })).toBeVisible();
  await page.screenshot({ path: `artifacts/practice-${label}-teacher-role.png` });
  await page.getByTestId('practice-view-toggle').click();
  // Nothing may push the page sideways (the status bar must fit on a phone).
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '역할을 확인했어요' }).click();

  // The discussion: no chat box anywhere, only a small memo. Partners speak by themselves.
  const mic = page.getByTestId('mic-controls');
  // Fingers on a phone, keys at a desk: the same two controls.
  const touch = Boolean(options.hasTouch);
  const press = async (kind, key) => {
    await page.locator('#memo-text').blur();
    if (touch) await page.getByTestId(`mic-${kind}`).click();
    else await page.keyboard.press(key);
  };
  await expect(title).toContainText('입장 발표', { timeout: 40000 });
  await expect(page.getByTestId('floor-card')).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(1);
  await expect(page.getByTestId('line-input')).toHaveCount(0);
  await expect(page.getByTestId('statement-item')).toHaveCount(6); // One card per person.

  // The memo: typing "z" in it must not switch on the microphone, and it stays on this device.
  await page.locator('#memo-text').fill('도윤 말이 조금 이상해');
  await page.locator('#memo-text').press('z');
  await expect(page.getByRole('heading', { name: '마이크를 켤까요?' })).toHaveCount(0);
  await expect(mic).toHaveAttribute('data-live', 'false');
  await expect(page.locator('#memo-text')).toHaveValue('도윤 말이 조금 이상해z');

  // Only the person whose turn it is can switch on; the teacher can bring a turn forward.
  await page.getByTestId('practice-view-toggle').click();
  const callMe = page.getByTestId('call-speaker').filter({ hasText: '연습생' });
  if (await callMe.count()) await callMe.click();
  await expect(page.getByTestId('current-speaker')).toHaveText('연습생');
  await page.getByTestId('line-input').fill('마이크가 놓친 말을 적었습니다');
  await page.getByTestId('line-add').click();
  await expect(page.locator('.transcript')).toContainText('마이크가 놓친 말을 적었습니다');
  await page.getByTestId('practice-view-toggle').click();

  // My turn: press, read the notice once, talk.
  await expect(page.getByTestId('mic-statement')).toBeEnabled();
  await page.screenshot({ path: `artifacts/practice-${label}-my-turn.png` });
  await press('statement', 'z');
  await page.screenshot({ path: `artifacts/practice-${label}-mic-notice.png` });
  await page.getByTestId('mic-confirm').click();
  await expect(mic).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId('mic-statement')).toContainText('말 끝내기');
  // Rude words stay off the shared record and wait for the teacher.
  await page.evaluate(() => window.__speech.say('닥쳐 다 틀렸어'));
  // What the microphone hears is written down under my name.
  await page.evaluate(() => window.__speech.say('저는 제 역할로서 학생의 사생활도 함께 지켜야 한다고 생각합니다'));
  await expect(page.getByTestId('statement-list')).toContainText('사생활도 함께');
  await expect(page.getByTestId('statement-list')).not.toContainText('닥쳐');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `artifacts/practice-${label}-mic-on.png` });
  // Pressing again ends the turn. Words the recognizer only hands over afterwards still count as mine.
  await press('statement', 'z');
  await expect(mic).toHaveAttribute('data-live', 'false');
  await expect(page.getByTestId('end-turn')).toHaveCount(0);
  await page.evaluate(() => window.__speech.say('마지막 한마디도 제 발표입니다'));
  await expect(page.getByTestId('statement-list')).toContainText('마지막 한마디');

  await expect(title).toContainText('사건·질문', { timeout: 60000 });
  await expect(page.locator('.event-card')).toBeVisible();
  await expect(page.getByTestId('end-turn')).toHaveCount(0); // Nobody's turn any more.
  await expect(page.getByTestId('mic-answer')).toBeVisible();

  // One microphone: while a partner talks mine stays off, whatever I press.
  await expect(page.getByTestId('mic-question')).toBeDisabled({ timeout: 30000 });
  await expect(page.getByTestId('mic-answer')).toBeDisabled();
  await page.keyboard.press('z');
  await page.keyboard.press('x');
  await expect(mic).toHaveAttribute('data-live', 'false');
  await page.screenshot({ path: `artifacts/practice-${label}-locked.png` });
  await expect(page.getByTestId('exchange-row').last()).toContainText(/질문|답변/);
  await expect(page.getByTestId('table-bubble').or(page.locator('.exchange-row'))).not.toHaveCount(0);

  // From here on the partners stay quiet, so the microphone is free whenever this test wants it.
  await expect(page.getByTestId('mic-question')).toBeEnabled({ timeout: 30000 });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('bridge.practice'));
    state.schedule = state.schedule.filter((job) => job.action !== 'floor');
    localStorage.setItem('bridge.practice', JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('#memo-text')).toHaveValue('도윤 말이 조금 이상해z'); // The memo survived the reload.

  // A question: the record says who asked and what.
  await expect(page.getByTestId('mic-question')).toBeEnabled();
  await press('question', 'z');
  await expect(mic).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId('mic-answer')).toBeDisabled(); // My own second button waits too.
  await page.evaluate(() => window.__speech.say('급한 연락은 어떻게 하면 좋을까요'));
  await expect(page.getByTestId('exchange-row').last()).toContainText('나 질문');
  await expect(page.getByTestId('exchange-row').last()).toContainText('급한 연락은');
  await press('question', 'z');
  await expect(mic).toHaveAttribute('data-live', 'false');
  // An answer, on the other control.
  await expect(page.getByTestId('mic-answer')).toBeEnabled({ timeout: 30000 });
  await press('answer', 'x');
  await expect(mic).toHaveAttribute('data-live', 'true');
  await page.evaluate(() => window.__speech.say('담임 선생님께 먼저 연락하면 됩니다'));
  await expect(page.getByTestId('exchange-row').last()).toContainText('나 답변');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `artifacts/practice-${label}-event.png` });
  await press('answer', 'x');
  await expect(mic).toHaveAttribute('data-live', 'false');
  if (!touch) {
    // With the Korean keyboard on, Z arrives as another letter; it is the key that counts.
    await expect(page.getByTestId('mic-question')).toBeEnabled({ timeout: 30000 });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'ㅋ', bubbles: true })));
    await expect(mic).toHaveAttribute('data-live', 'true');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'ㅋ', bubbles: true })));
    await page.waitForTimeout(200);
    await expect(mic).toHaveAttribute('data-live', 'true'); // A quick press stays on.
    await page.keyboard.press('z');
    await expect(mic).toHaveAttribute('data-live', 'false');
    // Held down it works like a walkie-talkie: letting go switches off.
    await expect(page.getByTestId('mic-question')).toBeEnabled({ timeout: 30000 });
    await page.keyboard.down('z');
    await expect(mic).toHaveAttribute('data-live', 'true');
    await page.waitForTimeout(1700);
    await page.keyboard.up('z');
    await expect(mic).toHaveAttribute('data-live', 'false');
  }

  // The time limit switches the microphone off by itself and frees it for the next person.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('bridge.practice'));
    state.snapshot.room.settings.micSeconds = 3;
    localStorage.setItem('bridge.practice', JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByTestId('mic-question')).toBeEnabled();
  await press('question', 'z');
  await expect(mic).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId('mic-remaining')).toContainText('00:0');
  await expect(mic).toHaveAttribute('data-live', 'false', { timeout: 6000 });
  await expect(page.getByTestId('mic-question')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bridge.practice')).snapshot.room.floor)).toBeNull();

  // The hand on the table: a card per person, and pressing one holds it up to read.
  if (await page.getByTestId('table-view').count()) {
    const scene = page.locator('.immersive-scene');
    const box = await scene.boundingBox();
    await expect(scene).toHaveAttribute('data-reading', 'false');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/practice-${label}-hand.png` });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);
    await expect(scene).toHaveAttribute('data-reading', 'true');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `artifacts/practice-${label}-card-read.png` });
    await page.keyboard.press('Escape');
    await expect(scene).toHaveAttribute('data-reading', 'false');
  }

  // The shared screen runs the same discussion.
  await page.getByTestId('practice-view-toggle').click();
  await expect(page.getByTestId('speaker-stage')).toBeVisible();
  await expect(page.getByTestId('speaker-eyebrow')).toContainText(/마이크가 비어|지금 말하는 사람/);
  await expect(page.getByTestId('call-speaker')).toHaveCount(0); // The floor is open: nobody to call on.
  await expect(page.getByTestId('participant-row')).toHaveCount(6);
  await expect(page.locator('body')).not.toContainText('당신은 역할 전환자');
  await expect(page.getByTestId('transcript-turn').first()).toBeVisible();
  await expect(page.locator('.transcript-phase').first()).toHaveText('입장 발표'); // The record is grouped by phase.
  await expect(page.locator('.transcript .turn-kind').first()).toHaveText(/질문|답변/);
  // No statement list or discussion summary here; the live board shows who is talking and how far the phase has got.
  await expect(page.getByTestId('summary-board')).toHaveCount(0);
  await expect(page.getByTestId('statement-list')).toHaveCount(0);
  await expect(page.getByTestId('live-progress')).toContainText(/명 참여/);
  await expect(page.getByTestId('live-status')).toHaveCount(6);
  await page.screenshot({ path: `artifacts/practice-${label}-teacher-event.png`, fullPage: true });
  // Recognition mistakes can be fixed or deleted.
  const line = page.getByTestId('transcript-line').first();
  await line.getByRole('button', { name: '이 발언 고치기' }).click();
  await page.getByRole('textbox', { name: '발언 고치기' }).fill('선생님이 고친 문장입니다');
  await page.getByRole('button', { name: '고친 내용 저장' }).click();
  await expect(page.getByTestId('transcript-line').first()).toContainText('선생님이 고친 문장입니다');
  await page.getByTestId('transcript-line').first().getByRole('button', { name: '이 발언 지우기' }).click();
  await expect(page.locator('.transcript')).not.toContainText('선생님이 고친 문장입니다');
  await page.getByTestId('moderation-toggle').click();
  await expect(page.getByTestId('moderation-entry')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '문제없음 · 그대로 공개' })).toBeDisabled();
  await page.getByTestId('moderation-toggle').click();
  // Classroom display: no teacher panels, only a count of what needs a look.
  await page.getByTestId('present-toggle').click();
  await expect(page.locator('.teacher-side')).toBeHidden();
  await expect(page.getByTestId('review-badge')).toContainText('1');
  await page.screenshot({ path: `artifacts/practice-${label}-classroom.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByTestId('present-toggle').click();
  await page.getByTestId('practice-view-toggle').click();

  if (page.viewportSize().width >= 1000) {
    await page.locator('.table-toggle').click();
    await expect(page.locator('.speaking-memo .notes')).toBeInViewport();
    await expect(page.getByTestId('memo-pad')).toBeInViewport();
    await page.screenshot({ path: `artifacts/practice-${label}-table-off.png` });
    // The full record stays one fold away. Phases read left to right, even before a phase has anything in it.
    await page.locator('.memo-fold summary').click();
    const columns = page.locator('.speaking-memo .transcript-phase');
    await expect(columns).toHaveText(['입장 발표', '사건·질문', '반론']);
    const [first, second, third] = await Promise.all([0, 1, 2].map(async (i) => (await columns.nth(i).boundingBox()).x));
    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(third);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
    await page.locator('.memo-fold summary').click();
    await page.locator('.table-toggle').click();
    await expect(page.getByTestId('table-view')).toBeVisible();
  }
  await page.getByTestId('practice-next').click();
  await expect(title).toContainText('반론');
  await expect(page.getByTestId('mic-rebuttal')).toContainText('반론하기');
  await expect(page.getByTestId('mic-answer')).toContainText('답변하기');
  await page.getByTestId('practice-next').click();

  await expect(title).toContainText('투표');
  await plate().getByRole('button').click(); // Picking at the table selects the candidate.
  await expect(page.locator('.candidate.picked')).toHaveCount(1);
  await page.getByRole('button', { name: '이대로 투표하기' }).click();
  await expect(page.getByTestId('reveal')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.switcher-name strong')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText(/1순위|2순위|최종 의견|진짜 의견/);
  await page.screenshot({ path: `artifacts/practice-${label}-reveal.png` });

  // A reload with lines already said must not stop the summary from refreshing.
  await page.reload();
  await expect(page.getByTestId('reveal')).toBeVisible(); // Saved in this browser.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('bridge.practice'));
    delete state.snapshot.rounds.summary;
    localStorage.setItem('bridge.practice', JSON.stringify(state));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bridge.practice')).snapshot.rounds.summary?.positions.length ?? 0), { timeout: 15000 }).toBeGreaterThan(0);
  await page.getByTestId('practice-view-toggle').click();
  await page.getByRole('button', { name: '게임 종료' }).click();
  await expect(page.getByTestId('game-summary')).toBeVisible();
  await page.getByTestId('practice-view-toggle').click();
  await expect(title).toContainText('게임 종료');
  await context.close();
  if (errors.length) throw new Error(errors.join(' | '));
  console.log(`PASS practice (${label})`);
}

async function teacherEntry() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await noWebFonts(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/\/api\/|:(8000|8080|9099)\/|identitytoolkit|firestore\.googleapis/.test(r.url())) errors.push(`network: ${r.url()}`);
  });
  await page.goto(`${origin}/practice`);
  await expect(page.getByTestId('practice-teacher-setup')).toBeDisabled();
  await page.getByRole('radio', { name: /학교 내 CCTV/ }).click();
  await page.getByTestId('practice-teacher-setup').click();
  await expect(page.locator('.teacher-room')).toBeVisible();
  await expect(page.getByTestId('start-game')).toBeDisabled();
  await expect(page.getByTestId('participant-row')).toHaveCount(6);
  await expect(page.locator('body')).not.toHaveClass(/flow-open/);
  // The teacher screen keeps only what is needed to run the game: no guide, no 3D table.
  await expect(page.locator('.guide')).toHaveCount(0);
  await expect(page.locator('.teacher-table')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.teacher-room')).toBeVisible();
  await page.getByTestId('practice-view-toggle').click();
  await expect(page.getByTestId('flow-overlay')).toBeVisible();
  if (errors.length) throw new Error(errors.join(' | '));
  await context.close();
  console.log('PASS practice (teacher entry, offline)');
}

try {
  await teacherEntry();
  if (!device || device === 'mobile') await play('mobile', { ...devices['Pixel 7'] });
  if (!device || device === 'desktop') await play('desktop', { viewport: { width: 1440, height: 900 } });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
