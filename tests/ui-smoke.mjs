import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const origin = process.env.YUNAN_UI_URL || 'http://localhost:5173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
await context.addInitScript(() => localStorage.setItem('yunan:briefing-seen', '1'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts', { recursive: true });

async function openCard(title) {
  const tray = page.getByTestId('immersive-action-tray');
  await expect(tray.locator('.action-panel h2')).toHaveText(title, { timeout: 65000 });
  await expect(tray.locator('.action-panel h2')).toBeVisible();
  return tray;
}

async function atStep(number) {
  await expect(page.getByTestId('action-step')).toHaveCount(1);
  await expect(page.getByTestId('action-step')).toHaveAttribute('data-step', String(number));
}

async function nextStep() {
  await page.getByTestId('action-next').click();
}

async function selectDeck(title) {
  const deck = page.getByTestId('deck-choice');
  for (let i = 0; i < 12; i++) {
    if ((await deck.locator('h3').textContent())?.trim() === title) {
      await deck.getByTestId('deck-select').click();
      return;
    }
    await page.getByTestId('deck-next').click();
  }
  throw new Error(`No card named ${title} in deck`);
}

try {
  await page.goto(origin);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('당신은 누구의');
  await expect(page.locator('.hero-canvas canvas')).toHaveCount(1, { timeout: 20000 });
  await page.getByRole('button', { name: /먼저 혼자 연습해 볼래요/ }).click();
  await expect(page).toHaveURL(`${origin}/practice`);
  await expect(page.getByTestId('immersive-room')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('immersive-world').locator('canvas')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: '연습 게임 시작' }).click();

  await expect(page.getByTestId('cinematic-reveal')).toBeVisible();
  const topic = await page.getByTestId('cinematic-title').textContent();
  expect(topic).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('cinematic-title')).toHaveText(topic, { timeout: 20000 });
  await page.getByTestId('cinematic-reveal').getByRole('button', { name: '나의 관점 정하기' }).click();

  await openCard('시작 전, 진짜 내 생각은?');
  await atStep(0);
  await page.screenshot({ path: 'artifacts/immersive-active-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/immersive-active-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectDeck('찬성');
  await nextStep();
  await atStep(1);
  await page.getByLabel('나의 이유').fill('다른 관점과 절차를 함께 살피고 싶습니다.');
  await nextStep();
  await atStep(2);
  const firstRole = (await page.getByTestId('deck-choice').locator('h3').textContent())?.trim();
  await page.getByTestId('deck-select').click();
  await page.getByTestId('deck-next').click();
  await page.getByTestId('deck-select').click();
  await nextStep();
  await atStep(3);
  await expect(page.locator('.stage-review')).toContainText(firstRole);
  await page.getByTestId('action-submit').click();

  await expect(page.getByTestId('cinematic-reveal')).toBeVisible();
  await expect(page.getByTestId('cinematic-reveal')).toContainText('당신의 비밀 역할');
  await page.getByTestId('cinematic-reveal').getByRole('button', { name: '연출 닫고 테이블 보기' }).click();
  await openCard('오늘 밤, 당신은');
  await expect(page.locator('.role-reveal')).toBeVisible();
  await page.getByRole('button', { name: /내 관점 카드/ }).click();
  const cards = page.getByRole('dialog', { name: '내 관점 카드' });
  await expect(cards.locator('.stage-private-card')).toHaveCount(1);
  await cards.getByRole('button', { name: '다음 관점 카드' }).click();
  await cards.getByRole('button', { name: '닫기' }).click();
  await page.reload();
  await expect(page.getByTestId('cinematic-reveal')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('cinematic-reveal').getByRole('button', { name: '이 역할로 시작하기' }).click();

  await openCard('당신의 입장을 밝혀 주세요');
  await atStep(0);
  await page.getByLabel('나의 입장 선언').fill('제가 맡은 역할에서는 보호할 가치와 실행 절차를 함께 따져야 합니다.');
  await nextStep();
  await atStep(1);
  await page.getByTestId('deck-next').click();
  await page.getByTestId('deck-select').click();
  await page.getByLabel('이 카드가 내 말과 어떻게 연결되나요?').fill('이 카드는 제 역할이 우선하는 가치를 구체적으로 보여줍니다.');
  await page.getByTestId('action-submit').click();

  // Between rounds: every turn is spotlighted, reactions travel both ways, then everyone moves on.
  const review = page.getByTestId('turn-review');
  await expect(review).toBeVisible();
  await expect(review).toContainText('입장 공개');
  await expect(page.getByTestId('turn-words')).toContainText('을 우선해야 합니다');
  await review.getByRole('button', { name: /설득력 있어요/ }).click();
  await expect(review.getByRole('button', { name: /설득력 있어요/ })).toHaveAttribute('aria-pressed', 'true');
  await review.getByRole('button', { name: /의 입장 보기$/ }).last().click();
  await expect(review).toContainText('나의 입장');
  await expect(review.locator('.turn-review__received li:not(.is-empty)').first()).toBeVisible({ timeout: 12000 });
  await page.screenshot({ path: 'artifacts/turn-review-desktop.png' });
  await page.getByTestId('review-done').click();

  await openCard('테이블에 사건이 도착했어요');
  await atStep(0);
  await page.getByTestId('deck-select').click();
  await nextStep();
  await atStep(1);
  await page.getByLabel('이 선택을 한 이유').fill('예외 기준을 공개하고 영향을 받는 사람의 설명을 듣겠습니다.');
  await nextStep();
  await atStep(2);
  await page.getByTestId('action-submit').click();

  await expect(review).toContainText('대응 공개');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/turn-review-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('review-done').click();

  await openCard('누구에게 물어볼까요?');
  await atStep(0);
  await page.locator('[data-testid="rail-player"][data-player-uid="bot-1"]').click();
  await expect(page.getByTestId('immersive-room')).toHaveAttribute('data-view', 'table');
  await expect(page.getByTestId('immersive-focus')).toContainText('모카');
  await page.getByTestId('immersive-focus').getByLabel('모카에 대한 메모').fill('질문 전 메모');
  await page.getByTestId('immersive-focus').getByRole('button', { name: '의심' }).click();
  await expect(page.getByTestId('immersive-focus').locator('.table-dossier__words li').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/table-view-dossier.png' });
  await page.getByRole('button', { name: /모카 선택하고 미션 카드로/ }).click();
  await expect(page.getByTestId('immersive-room')).toHaveAttribute('data-view', 'mission');
  await expect(page.getByTestId('deck-choice')).toContainText('모카');
  await nextStep();
  await atStep(1);
  await page.getByTestId('deck-select').click();
  await page.getByTestId('action-submit').click();
  const answer = page.locator('.stage-incoming .answer-card').first();
  await expect(answer).toBeVisible();
  await answer.getByLabel('나의 답변').fill('예외의 근거를 공개하고 정기적으로 다시 검토하겠습니다.');
  await answer.getByRole('button', { name: '답변 제출' }).click();
  await page.getByRole('button', { name: '질문을 마치고 추리하기' }).click();

  await openCard('누가 역할 전환자일까요?');
  await atStep(0);
  await page.getByRole('button', { name: '테이블 보기' }).click();
  await page.locator('.immersive-scene__name[data-player-uid="bot-2"]').click();
  await expect(page.getByTestId('immersive-focus')).toContainText('올리브');
  await page.getByRole('button', { name: /올리브 선택하고 미션 카드로/ }).click();
  await expect(page.getByTestId('deck-choice')).toContainText('올리브');
  await page.locator('.immersive-tools').getByRole('button', { name: '추리 메모' }).click();
  await expect(page.getByLabel('모카에 대한 메모')).toHaveValue('질문 전 메모');
  await page.getByRole('button', { name: '닫기' }).click();
  await nextStep();
  await atStep(1);
  await nextStep();
  await atStep(2);
  await page.getByLabel('추리한 이유').fill('사건 대응에서 내세운 우선순위가 앞선 발언과 달랐습니다.');
  await page.getByTestId('action-submit').click();

  await expect(page.getByTestId('cinematic-reveal')).toBeVisible();
  await page.getByTestId('cinematic-reveal').getByRole('button', { name: '정체와 평가 보기' }).click();
  await openCard('가면을 벗을 시간');
  await atStep(0);
  await expect(page.locator('.stage-reveal-card')).toHaveCount(1);
  await nextStep();
  await atStep(1);
  await selectDeck('모카');
  await nextStep();
  await atStep(2);
  await page.getByRole('button', { name: '다음 평가 기준' }).click();
  await page.getByTestId('action-submit').click();
  await page.reload();
  await page.getByTestId('cinematic-reveal').getByRole('button', { name: '정체와 평가 보기' }).click();
  await openCard('가면을 벗을 시간');
  await nextStep();
  await expect(page.locator('.stage-selection-summary')).toContainText('1명 평가 완료');
  await page.getByRole('button', { name: '평가를 마치고 내 생각 돌아보기' }).click();

  await openCard('이제, 진짜 나로 돌아옵니다');
  await atStep(0);
  await expect(page.locator('.original-position')).toContainText('다른 관점과 절차');
  await expect(page.getByTestId('deck-choice')).toContainText('찬성');
  await page.getByTestId('deck-select').click();
  await nextStep();
  await atStep(1);
  await page.getByLabel('새롭게 이해한 점').fill('상대 역할이 지키려는 가치도 중요하다는 점을 이해했습니다.');
  await nextStep();
  await atStep(2);
  await page.getByLabel('여전히 동의하지 않는 점').fill('모든 상황에 같은 규칙을 적용하는 데에는 동의하지 않습니다.');
  await nextStep();
  await atStep(3);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByLabel('지금, 나의 진짜 의견').fill('초기 생각은 유지하되 예외 기준을 함께 마련해야 한다고 생각합니다.');
  await page.getByTestId('action-submit').click();

  await expect(page.getByTestId('immersive-results')).toBeVisible();
  await expect(page.locator('.immersive-score strong')).toContainText('60');
  await page.reload();
  await expect(page.getByTestId('immersive-results')).toBeVisible();
  await expect(page.getByTestId('immersive-results')).toContainText('초기 생각은 유지하되');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/immersive-results-mobile.png' });
  expect(errors).toEqual([]);
  console.log('PASS: full immersive practice flow, refresh recovery, private reflection, scoring, mobile layout, no page errors.');
} finally {
  await browser.close();
}
