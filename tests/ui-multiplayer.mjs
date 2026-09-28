import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Requires the frontend, FastAPI server, and Auth/Firestore emulators.
// Each player uses an isolated browser context and every move is made in the UI.
const origin = process.env.YUNAN_UI_URL || 'http://localhost:5173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const players = [];
const pageErrors = [];
const apiErrors = [];
const startedAt = Date.now();
let currentStep = 'setup';
let roomId;
let topicId;
await mkdir('artifacts', { recursive: true });

function step(label) {
  currentStep = label;
  console.log(`[${Math.round((Date.now() - startedAt) / 1000)}s] ${label}`);
}

function remember(player, snapshot) {
  if (!snapshot?.room || !snapshot?.me) return;
  const previous = player.snapshot;
  if (!previous || snapshot.room.phaseVersion > previous.room.phaseVersion ||
      (snapshot.room.phaseVersion === previous.room.phaseVersion &&
       (snapshot.room.revision ?? 0) >= (previous.room.revision ?? 0))) {
    player.snapshot = snapshot;
  }
}

async function openCard(player, title) {
  const cinematic = player.page.getByTestId('cinematic-reveal');
  const tray = player.page.getByTestId('immersive-action-tray');
  const heading = tray.locator('.action-panel h2');
  await expect.poll(async () => {
    if (await cinematic.isVisible()) {
      await cinematic.getByRole('button', { name: '연출 닫고 테이블 보기' }).click();
    }
    return await heading.count() ? await heading.textContent() : null;
  }, { timeout: 65000, message: `${player.name} should reach ${title}` }).toBe(title);
  await expect(heading).toBeVisible({ timeout: 20000 });
  return tray;
}

async function atStep(player, number) {
  await expect(player.page.getByTestId('action-step')).toHaveCount(1);
  await expect(player.page.getByTestId('action-step')).toHaveAttribute('data-step', String(number));
}

async function nextStep(player) {
  await player.page.getByTestId('action-next').click();
}

async function selectDeck(player, title) {
  const deck = player.page.getByTestId('deck-choice');
  for (let i = 0; i < 12; i++) {
    if ((await deck.locator('h3').textContent())?.trim() === title) {
      await deck.getByTestId('deck-select').click();
      return;
    }
    await player.page.getByTestId('deck-next').click();
  }
  throw new Error(`${player.name}: no card named ${title}`);
}

async function allOpen(title) {
  await Promise.all(players.map((player) => openCard(player, title)));
}

async function submit(player, label, action, within = player.page) {
  const [response] = await Promise.all([
    player.page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return candidate.request().method() === 'POST' &&
        url.pathname === `/api/rooms/${roomId}/${action}`;
    }, { timeout: 40000 }),
    within.getByRole('button', { name: label }).click(),
  ]);
  const snapshot = await response.json();
  expect(response.status(), `${player.name} ${action}: ${JSON.stringify(snapshot.detail)}`).toBe(200);
  remember(player, snapshot);
  return snapshot;
}

// Between rounds every browser sees the same turns; a reaction sent by one arrives live at another.
async function reviewRound(label) {
  await Promise.all(players.map((player) => expect(player.page.getByTestId('turn-review')).toContainText(label, { timeout: 65000 })));
  const [sender, receiver] = players;
  const review = sender.page.getByTestId('turn-review');
  await review.getByRole('button', { name: `${receiver.name}의 ${label === '입장 공개' ? '입장' : '대응'} 보기` }).click();
  await submit(sender, /공감돼요/, 'react', review);
  await expect(receiver.page.locator('.reaction-feed p.is-me'), `${receiver.name} should see ${sender.name}'s reaction arrive`)
    .toContainText(sender.name, { timeout: 20000 });
  await Promise.all(players.map((player) => submit(player, /다 봤어요/, 'review-done')));
}

async function noVisibleErrors() {
  for (const player of players) {
    await expect(player.page.locator('.immersive-error'), `${player.name} should not show a game error`).toHaveCount(0);
  }
}

try {
  for (let i = 0; i < 4; i++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    // Four WebGL rooms share one test machine; audio is covered in ui-audio.mjs.
    await context.addInitScript(() => {
      localStorage.setItem('yunan:briefing-seen', '1');
      localStorage.setItem('yunan:game-audio', 'off');
      localStorage.setItem('yunan:game-music', 'off');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const player = {
      context,
      page,
      name: `browser${i + 1}`,
      initial: `초기비공개${i + 1} 역할과 실제 생각을 분리해서 기록합니다.`,
      final: i === 0
        ? '공유동의최종의견 다른 역할의 우선 가치를 이해하고 초기 생각을 수정합니다.'
        : `비공개최종의견${i + 1} 이 생각은 개인 결과에서만 확인합니다.`,
    };
    page.on('pageerror', (error) => pageErrors.push({ player: player.name, message: error.message }));
    page.on('response', async (response) => {
      if (!response.url().includes('/api/rooms')) return;
      if (response.status() >= 400) {
        apiErrors.push({ player: player.name, status: response.status(), path: new URL(response.url()).pathname });
      }
      try { remember(player, await response.json()); } catch { /* Cancelled or non-JSON response. */ }
    });
    players.push(player);
  }

  step('Create an immersive table');
  const host = players[0];
  await host.page.goto(origin);
  await host.page.getByRole('button', { name: '테이블 만들기', exact: true }).click();
  const dialog = host.page.getByRole('dialog');
  await dialog.getByLabel('닉네임').fill(host.name);
  const created = host.page.waitForResponse((response) =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/rooms');
  await dialog.getByRole('button', { name: '테이블 만들기', exact: true }).click();
  const createResponse = await created;
  expect(createResponse.status()).toBe(200);
  const initialSnapshot = await createResponse.json();
  roomId = initialSnapshot.room.roomId;
  remember(host, initialSnapshot);
  const code = initialSnapshot.room.code;
  await expect(host.page.getByTestId('immersive-room')).toBeVisible({ timeout: 20000 });
  await expect(host.page.getByRole('button', { name: '게임 시작' })).toBeDisabled();

  step('Join and ready three isolated players');
  for (const player of players.slice(1)) {
    await player.page.goto(origin);
    await player.page.getByRole('button', { name: '초대 코드로 입장', exact: true }).click();
    const modal = player.page.getByRole('dialog');
    await modal.getByLabel('닉네임').fill(player.name);
    await modal.getByLabel('6자리 초대 코드').fill(code);
    const joining = player.page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/rooms/join');
    await modal.getByRole('button', { name: '테이블 입장하기' }).click();
    const response = await joining;
    expect(response.status()).toBe(200);
    remember(player, await response.json());
    await expect(player.page).toHaveURL(`${origin}/room/${roomId}`);
    await expect(player.page.getByTestId('immersive-room')).toBeVisible({ timeout: 60000 });
    await submit(player, '자리에 앉아 준비하기', 'ready');
  }
  const uids = players.map((player) => player.snapshot.me.uid);
  expect(new Set(uids).size).toBe(4);
  for (const player of players) {
    await expect(player.page.locator('.immersive-seated-count')).toContainText('4명 입장');
    await expect(player.page.locator('.immersive-seated-count')).toContainText('4명 준비 완료');
    await expect(player.page.locator('.immersive-scene__name')).toHaveCount(3);
  }
  await expect(host.page.getByRole('button', { name: '게임 시작' })).toBeEnabled();
  await noVisibleErrors();

  step('Start one shared topic and submit private initial opinions');
  const startSnapshot = await submit(host, '게임 시작', 'start');
  topicId = startSnapshot.room.topicId;
  await Promise.all(players.map(async (player) => {
    const cinematic = player.page.getByTestId('cinematic-reveal');
    await expect(cinematic).toBeVisible({ timeout: 20000 });
    await expect(cinematic.getByTestId('cinematic-title')).toHaveText(startSnapshot.room.topic.title);
    await cinematic.getByRole('button', { name: '연출 닫고 테이블 보기' }).click();
  }));
  await allOpen('시작 전, 진짜 내 생각은?');
  for (const player of players) {
    expect(player.snapshot.room.topic.title).toBe(startSnapshot.room.topic.title);
  }
  await Promise.all(players.map(async (player) => {
    await atStep(player, 0);
    await selectDeck(player, '찬성');
    await nextStep(player);
    await player.page.getByLabel('나의 이유').fill(player.initial);
    await nextStep(player);
    await player.page.getByTestId('deck-select').click();
    await player.page.getByTestId('deck-next').click();
    await player.page.getByTestId('deck-select').click();
    await nextStep(player);
    await submit(player, '비공개로 제출', 'initial-position');
  }));
  // The live role reveal lasts only 15 seconds. Its presentation is covered by
  // the practice test; here we follow the server into the first shared round.
  await allOpen('당신의 입장을 밝혀 주세요');
  for (const player of players) expect(player.snapshot.room.topicId).toBe(topicId);

  step('Claim with cards; pending claims stay private');
  async function claim(player) {
    await atStep(player, 0);
    await player.page.getByLabel('나의 입장 선언').fill(`${player.name} 역할의 가치를 실행 가능한 절차와 함께 설명합니다.`);
    await nextStep(player);
    await player.page.getByTestId('deck-next').click();
    await player.page.getByTestId('deck-select').click();
    await player.page.getByLabel('이 카드가 내 말과 어떻게 연결되나요?').fill('관점 카드의 근거를 이 역할의 우선 가치에 연결합니다.');
    await submit(player, '입장 선언 제출', 'claim');
  }
  await claim(host);
  // While the others are still writing, the host sees who has submitted and can look around.
  await expect(host.page.locator('.waiting-table li.is-done')).toHaveCount(1);
  await expect(host.page.locator('.waiting-table li')).toHaveCount(4);
  await host.page.screenshot({ path: 'artifacts/multiplayer-waiting.png' });
  for (const player of players.slice(1)) {
    expect(JSON.stringify(player.snapshot.rounds.claim)).not.toContain('browser1 역할의');
  }
  await Promise.all(players.slice(1).map(claim));
  step('Review every claim together and exchange a live reaction');
  await reviewRound('입장 공개');
  await allOpen('테이블에 사건이 도착했어요');
  for (const player of players) {
    expect(player.snapshot.rounds.claim.length).toBe(4);
  }

  step('Respond to the shared event');
  await Promise.all(players.map(async (player, i) => {
    await atStep(player, 0);
    for (let choice = 0; choice < i; choice++) await player.page.getByTestId('deck-next').click();
    await player.page.getByTestId('deck-select').click();
    await nextStep(player);
    await player.page.getByLabel('이 선택을 한 이유').fill('이 역할이 지키려는 가치를 앞세우되 예외 기준을 공개합니다.');
    await nextStep(player);
    await submit(player, '사건 대응 제출', 'scenario');
  }));
  step('Review every response together');
  await reviewRound('대응 공개');
  await allOpen('누구에게 물어볼까요?');

  step('Each person questions the next and answers an incoming question');
  await Promise.all(players.map(async (player, i) => {
    await selectDeck(player, players[(i + 1) % players.length].name);
    await nextStep(player);
    await player.page.getByTestId('deck-select').click();
    await submit(player, '질문 보내기', 'question');
  }));
  await Promise.all(players.map(async (player) => {
    const incoming = player.page.locator('.stage-incoming .answer-card');
    await expect(incoming).toHaveCount(1);
    await incoming.getByLabel('나의 답변').fill('예외 기준을 공개하고 결정의 결과를 다시 검토하겠습니다.');
    await submit(player, '답변 제출', 'answer', incoming);
  }));
  await allOpen('누가 역할 전환자일까요?');

  step('Guess and reveal roles');
  await Promise.all(players.map(async (player, i) => {
    await selectDeck(player, players[(i + 1) % players.length].name);
    await nextStep(player);
    await nextStep(player);
    await player.page.getByLabel('추리한 이유').fill('사건 대응의 우선순위와 초기 주장이 다르게 들렸습니다.');
    await submit(player, '추리 확정하기', 'guess');
  }));
  await allOpen('가면을 벗을 시간');
  for (const player of players) {
    await expect(player.page.locator('.stage-reveal-card')).toHaveCount(1);
    expect(player.snapshot.rounds.reveal.filter((entry) => entry.isSwitcher).length).toBeGreaterThanOrEqual(2);
    for (const other of players.filter((other) => other !== player)) {
      await expect(player.page.locator('main')).not.toContainText(other.initial);
    }
  }

  step('Rate in a cycle and restore rating state on refresh');
  async function rate(player, i) {
    await atStep(player, 0);
    await nextStep(player);
    await selectDeck(player, players[(i + 1) % players.length].name);
    await nextStep(player);
    await player.page.getByRole('button', { name: '역할을 얼마나 정확하게 대변했나요? 4점' }).click();
    await player.page.getByRole('button', { name: '다음 평가 기준' }).click();
    await player.page.getByRole('button', { name: '다른 관점을 존중했나요? 5점' }).click();
    await player.page.getByRole('button', { name: '다음 평가 기준' }).click();
    await player.page.getByRole('button', { name: '근거를 잘 활용했나요? 4점' }).click();
    await submit(player, '참가자 평가 제출', 'rating');
  }
  await rate(host, 0);
  await host.page.reload();
  await openCard(host, '가면을 벗을 시간');
  await nextStep(host);
  await expect(host.page.locator('.stage-selection-summary')).toContainText('1명 평가 완료');
  await Promise.all(players.slice(1).map((player, i) => rate(player, i + 1)));
  await allOpen('이제, 진짜 나로 돌아옵니다');
  await noVisibleErrors();

  step('Only host opts into sharing a final reflection');
  await Promise.all(players.map(async (player, i) => {
    await atStep(player, 0);
    await expect(player.page.locator('.original-position')).toContainText(player.initial);
    await expect(player.page.getByTestId('deck-choice')).toContainText('찬성');
    await player.page.getByTestId('deck-select').click();
    await nextStep(player);
    await player.page.getByLabel('새롭게 이해한 점').fill('상대가 지키려는 우선 가치의 이유를 이해했습니다.');
    await nextStep(player);
    await player.page.getByLabel('여전히 동의하지 않는 점').fill('모든 상황에서 하나의 기준만 적용하는 것에는 동의하지 않습니다.');
    await nextStep(player);
    await expect(player.page.getByRole('checkbox')).not.toBeChecked();
    await player.page.getByLabel('지금, 나의 진짜 의견').fill(player.final);
    if (i === 0) await player.page.getByRole('checkbox').check();
    await submit(player, '내 목소리 남기기', 'reflection');
  }));
  await Promise.all(players.map((player) => expect(player.page.getByTestId('immersive-results')).toBeVisible({ timeout: 65000 })));

  step('Check scoring, opt-in privacy, and reload recovery');
  for (const player of players) {
    const results = player.page.getByTestId('immersive-results');
    await expect(results).toContainText(players[0].final);
    await expect(results).toContainText(player.initial);
    await expect(results).toContainText(player.final);
    for (const other of players.filter((other) => other !== player)) {
      await expect(player.page.locator('main')).not.toContainText(other.initial);
      expect(JSON.stringify(player.snapshot)).not.toContain(other.initial);
      if (other !== host) {
        await expect(player.page.locator('main')).not.toContainText(other.final);
        expect(JSON.stringify(player.snapshot)).not.toContain(other.final);
      }
    }
    expect(player.snapshot.room.phase).toBe('results');
    expect(player.snapshot.room.topicId).toBe(topicId);
    expect(player.snapshot.results.me.total).toBeGreaterThanOrEqual(0);
    expect(player.snapshot.results.me.total).toBeLessThanOrEqual(100);
    expect(player.snapshot.results.me.breakdown).toHaveLength(8);
    await player.page.reload();
    await expect(player.page.getByTestId('immersive-results')).toContainText(player.final, { timeout: 40000 });
    await expect(player.page.getByTestId('immersive-results')).toContainText(startSnapshot.room.topic.title, { timeout: 40000 });
  }
  await noVisibleErrors();
  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
  await host.page.screenshot({ path: 'artifacts/multiplayer-results-desktop.png' });
  const report = {
    passed: true,
    roomId,
    topicId,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    players: players.map((player) => ({ nickname: player.name, total: player.snapshot.results.me.total })),
    sharedReflectionCount: host.snapshot.rounds.sharedReflections.length,
    pageErrors,
    apiErrors,
  };
  await writeFile('artifacts/ui-multiplayer-report.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log('PASS: four isolated users completed the immersive game, with private submissions, opt-in sharing, and refresh recovery.');
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(`FAIL at step: ${currentStep}`);
  console.error(JSON.stringify({ pageErrors, apiErrors, phases: players.map((player) => ({ name: player.name, phase: player.snapshot?.room?.phase, url: player.page.url() })) }));
  await Promise.all(players.map(async (player, i) => {
    await player.page.screenshot({ path: `artifacts/multiplayer-failure-${i + 1}.png` }).catch(() => {});
  }));
  throw error;
} finally {
  await browser.close();
}
