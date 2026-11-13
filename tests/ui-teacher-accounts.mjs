import { chromium, expect as baseExpect } from '@playwright/test';

// Run with the Auth/Firestore emulators and a Vite server using VITE_USE_FIREBASE_EMULATORS=true.
const expect = baseExpect.configure({ timeout: 20000 });
const origin = process.env.BRIDGE_UI_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const errors = [];
const accountA = `history-A-${Date.now()}`;
const accountB = `history-B-${Date.now()}`;
async function open(account) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/teacher/history`);
  await page.evaluate(async (uid) => {
    const firebase = await import('/src/lib/firebase.ts');
    await firebase.signInAsTestTeacher(uid);
  }, account);
  await expect(page.getByTestId('history-page')).toBeVisible();
  return { page, context };
}
const settled = async page => expect(page.getByText('계정에 저장하는 중이에요…', { exact: true })).toBeHidden();

try {
  const owner = await open(accountA);
  await owner.page.goto(`${origin}/teacher/preview/ended?topic=school_cctv`);
  await expect(owner.page.getByTestId('game-summary')).toBeVisible();
  await owner.page.locator('#phase-memo-text').fill('A 선생님의 비공개 관찰 메모');
  await owner.page.getByTestId('memo-add').click();
  await expect(owner.page.getByTestId('memo-entry')).toContainText('비공개 관찰');
  await settled(owner.page);
  const key = await owner.page.evaluate(async () => (await import('/src/features/teacher/teacherStorage.ts')).loadHistory()[0].key);

  await owner.page.getByRole('tab', { name: '수행평가 레포트' }).click();
  await owner.page.getByRole('tab', { name: '학생별 리포트', exact: true }).click();
  await owner.page.getByTestId('ai-report-generate').click();
  await expect(owner.page.getByTestId('ai-report')).toBeVisible();
  await settled(owner.page);

  const secondDevice = await open(accountA);
  await expect(secondDevice.page.getByTestId('history-card')).toHaveCount(1);
  await secondDevice.page.goto(`${origin}/teacher/history/${encodeURIComponent(key)}`);
  await expect(secondDevice.page.getByTestId('history-result')).toBeVisible();
  await expect(secondDevice.page.getByTestId('memo-entry')).toContainText('비공개 관찰');
  await secondDevice.page.getByRole('tab', { name: '학생별 리포트', exact: true }).click();
  await expect(secondDevice.page.getByTestId('ai-report')).toBeVisible();
  console.log('PASS same account restores history, notes and AI reports on another browser');

  await owner.page.goto(`${origin}/teacher/history`);
  await owner.page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(owner.page.getByTestId('login-google')).toBeVisible();
  await owner.page.evaluate(async (account) => (await import('/src/lib/firebase.ts')).signInAsTestTeacher(account), accountB);
  await expect(owner.page.getByTestId('history-page')).toBeVisible();
  await expect(owner.page.getByTestId('history-card')).toHaveCount(0);
  await owner.page.goto(`${origin}/teacher/history/${encodeURIComponent(key)}`);
  await expect(owner.page.getByTestId('history-result')).toHaveCount(0);
  await expect(owner.page.getByText('내 계정에서 이 토론 기록을 찾을 수 없어요.', { exact: false })).toBeVisible();
  console.log('PASS account switch hides the previous teacher history and direct result URL');

  await owner.page.goto(`${origin}/teacher/preview/reveal?topic=school_cctv`);
  await expect(owner.page.getByTestId('reveal-side')).toBeVisible();
  await settled(owner.page);
  await owner.page.goto(`${origin}/teacher/history`);
  await expect(owner.page.getByTestId('history-card')).toHaveCount(1);
  owner.page.once('dialog', dialog => dialog.accept());
  await owner.page.locator('.history-delete').click();
  await expect(owner.page.getByTestId('history-card')).toHaveCount(0);
  await settled(owner.page);
  await secondDevice.page.goto(`${origin}/teacher/history`);
  await expect(secondDevice.page.getByTestId('history-card')).toHaveCount(1);
  console.log('PASS deleting one teacher record leaves the other teacher history intact');

  await owner.context.close();
  await secondDevice.context.close();
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
