import { chromium, expect as baseExpect } from '@playwright/test';

// The teacher features from main must work with front's phase and voting changes.
const expect = baseExpect.configure({ timeout: 15000 });
const origin = process.env.BRIDGE_UI_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];

async function contextFor(viewport) {
  const context = await browser.newContext({ viewport });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/api\/|identitytoolkit|firestore\.googleapis/.test(request.url())) errors.push(`Unexpected offline request: ${request.url()}`);
    });
  });
  return context;
}

try {
  const phases = ['lobby', 'role', 'statement', 'event', 'vote', 'reveal', 'ended'];
  for (const phase of phases) {
    const context = await contextFor({ width: 1440, height: 900 });
    const page = await context.newPage();
    await page.goto(`${origin}/teacher/preview/${phase}?topic=school_cctv`);
    await expect(page.getByTestId('practice-phase-jump')).toHaveValue(phase);
    await expect(page.getByTestId('practice-phase-jump').locator('option[value="rebuttal"]')).toHaveCount(0);
    await expect(page.getByTestId('participant-row')).toHaveCount(6);
    await expect(page.getByTestId('phase-memo')).toBeVisible();
    if (phase !== 'lobby') await expect(page.getByTestId('participation-grid')).toBeVisible();
    // The teacher screen fits one window: nothing below it to scroll to.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(0);
    if (phase === 'reveal' || phase === 'ended') {
      // Results first; the report is one section tab away.
      await expect(page.getByTestId('reveal-side')).toBeVisible();
      if (phase === 'ended') await expect(page.getByTestId('game-summary')).toBeVisible();
      await page.getByRole('tab', { name: '수행평가 레포트' }).click();
      await expect(page.getByTestId('teacher-report')).toBeVisible();
      const state = await page.evaluate(() => JSON.parse(localStorage.getItem('bridge.practice')));
      if (!state.snapshot.rounds.reveal.ballots.every(ballot => ballot.voted)) throw new Error('Preview lost the completed votes');
      await page.getByRole('tab', { name: '학생별 리포트', exact: true }).click();
      await page.getByTestId('ai-report-generate').click();
      await expect(page.getByTestId('ai-report')).toBeVisible();
    }
    await context.close();
    console.log(`PASS teacher preview: ${phase}`);
  }

  for (const viewport of [{ width: 1440, height: 900 }, { width: 412, height: 915 }]) {
    const context = await contextFor(viewport);
    const page = await context.newPage();
    await page.goto(`${origin}/teacher/preview/event?topic=school_cctv`);
    await expect(page.getByTestId('practice-phase-jump')).toHaveValue('event');
    // The memo lives in a sidebar: open on wide screens, closed on phones until the teacher opens it.
    const memoToggle = page.getByTestId('memo-toggle');
    if (viewport.width >= 1200) {
      await expect(page.getByTestId('phase-memo')).toBeVisible();
      await memoToggle.click();
      await expect(page.getByTestId('phase-memo')).toBeHidden();
    } else {
      await expect(page.getByTestId('phase-memo')).toBeHidden();
    }
    await memoToggle.click();
    await expect(page.locator('#phase-memo-text')).toBeFocused();
    await page.locator('#phase-memo-text').fill('Merge verification: evidence from the discussion');
    await page.getByTestId('memo-add').click();
    await page.reload();
    await expect(page.getByTestId('memo-entry')).toContainText('Merge verification');
    await page.getByTestId('next-phase').click();
    await expect(page.getByTestId('practice-phase-jump')).toHaveValue('vote');
    await page.getByTestId('next-phase').click();
    await page.getByRole('tab', { name: '수행평가 레포트' }).click();
    await expect(page.getByTestId('teacher-report')).toBeVisible();
    await page.getByRole('button', { name: '게임 종료', exact: true }).click();
    await page.getByRole('tab', { name: '결과와 참여' }).click();
    await expect(page.getByTestId('game-summary')).toBeVisible();
    await page.goto(`${origin}/teacher/history`);
    await expect(page.getByTestId('history-page')).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bridge.debateHistory'))[0]);
    if (!saved.notes.event.some(note => note.text.includes('Merge verification'))) throw new Error('Saved debate lost teacher notes');
    await page.goto(`${origin}/teacher/history/${encodeURIComponent(saved.key)}`);
    await expect(page.getByTestId('history-result')).toBeVisible();
    await expect(page.getByTestId('teacher-report')).toBeVisible();
    await context.close();
    console.log(`PASS teacher notes, vote, report and history: ${viewport.width}px`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
