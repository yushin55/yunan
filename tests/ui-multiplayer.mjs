import { chromium, devices, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Requires the frontend, the FastAPI server and the Auth/Firestore emulators.
// One teacher (desktop) and six students (mobile), each in an isolated browser context.
// Every move is made through the UI.
const origin = process.env.BRIDGE_UI_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const startedAt = Date.now();
await mkdir('artifacts', { recursive: true });

function step(label) {
  console.log(`[${Math.round((Date.now() - startedAt) / 1000)}s] ${label}`);
}

async function open(name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`${name}: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource|permission-denied/.test(msg.text())) pageErrors.push(`${name}: ${msg.text()}`);
  });
  return { name, context, page };
}

const shot = (who, file) => who.page.screenshot({ path: `artifacts/${file}.png`, fullPage: true });
// Students see the phase in the top status bar; the teacher keeps the larger phase header.
const phaseTitle = (who) => who.page.locator('.phase-header h2, [data-testid=phase-pill]').first();

// Watch the issue briefing to the end (stepping through scenes), then read the rules.
async function brief(page) {
  await page.getByTestId('briefing-play').click();
  // The anchor segment starts after the opening title card.
  await expect(page.getByTestId('briefing-headline')).toBeVisible({ timeout: 10000 });
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


try {
  step('teacher creates a room');
  const teacher = await open('teacher', { viewport: { width: 1400, height: 950 } });
  await teacher.page.goto(`${origin}/teacher/new`);
  await teacher.page.getByRole('radio', { name: /수업 중 학생의 스마트폰/ }).click();
  await teacher.page.getByTestId('create-room').click();
  await teacher.page.waitForURL(/\/room\//);
  const code = (await teacher.page.getByTestId('room-code').first().textContent()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  step('six students join with nicknames');
  const students = [];
  for (let i = 0; i < 6; i++) {
    const student = await open(`student${i}`, { ...devices['Pixel 7'] });
    student.nickname = `학생${i + 1}`;
    await student.page.goto(`${origin}/join?code=${code}`);
    await student.page.getByLabel('닉네임').fill(student.nickname);
    await student.page.getByRole('button', { name: '입장하기' }).click();
    await student.page.waitForURL(/\/room\//);
    students.push(student);
  }
  await expect(teacher.page.getByTestId('participant-row')).toHaveCount(6);
  await expect(teacher.page.getByTestId('start-game')).toBeDisabled();

  step('students read the rules and pick two preferred roles');
  const picks = [[0, 1], [0, 1], [0, 1], [1, 2], [2, 3], [3, 4]];
  for (const [i, student] of students.entries()) {
    await brief(student.page);
    await pickRoles(student.page, picks[i]);
    await expect(student.page.getByText('선호 역할을 골랐어요')).toBeVisible();
  }
  await shot(students[0], 'student-lobby');
  // The teacher sees completion only, never which roles were chosen.
  const board = teacher.page.locator('.participation');
  await expect(board.getByText('완료')).toHaveCount(6);
  await expect(board).not.toContainText(/순위|학생회 대표|담임 교사|학부모|정보 교과 교사|상담 교사/);
  await shot(teacher, 'teacher-lobby');

  step('teacher starts; each student sees only their own secret role');
  await teacher.page.getByTestId('start-game').click();
  const switchers = [];
  for (const student of students) {
    await expect(phaseTitle(student)).toContainText('역할 확인');
    const identity = await student.page.getByTestId('identity').textContent();
    student.isSwitcher = identity.includes('당신은 역할 전환자예요');
    if (student.isSwitcher) switchers.push(student);
    student.roleName = (await student.page.locator('.role-card h3').textContent()).trim();
  }
  expect(switchers).toHaveLength(1);
  const switcher = switchers[0];
  expect(students.indexOf(switcher)).toBeLessThan(3); // Drawn from the most chosen first preference.
  const roleNames = ['학생회 대표', '담임 교사', '학부모', '정보 교과 교사', '상담 교사'];
  const prefNames = picks[students.indexOf(switcher)].map((i) => roleNames[i]);
  expect(prefNames).not.toContain(switcher.roleName); // Switcher got a role outside both preferences.
  for (const [i, student] of students.entries()) {
    if (!student.isSwitcher) expect(picks[i].map((x) => roleNames[x])).toContain(student.roleName);
  }
  await expect(teacher.page.locator('body')).not.toContainText('역할 전환자예요');
  await shot(switcher, 'student-secret-role');
  for (const student of students) await student.page.getByRole('button', { name: '역할을 확인했어요' }).click();

  step('statements: a rude one is sent back privately, then everyone presents');
  for (const student of students) await expect(phaseTitle(student)).toContainText('입장 발표');
  await students[0].page.getByLabel(/이 주제에 대해 어떻게 생각하나요/).fill('닥쳐 너희는 다 틀렸어');
  await students[0].page.getByRole('button', { name: '발표하기' }).click();
  await expect(students[0].page.getByTestId('moderation-notice')).toContainText('표현을 다듬어 주세요');
  await expect(students[1].page.getByTestId('moderation-notice')).toHaveCount(0);
  await shot(students[0], 'student-moderation-notice');
  for (const [i, student] of students.entries()) {
    await student.page.getByLabel(/이 주제에 대해 어떻게 생각하나요/).fill(`저는 ${student.roleName}로서 규칙에 예외가 필요하다고 생각합니다. (${i + 1})`);
    await student.page.getByRole('button', { name: '발표하기' }).click();
    if (i < 5) await expect(student.page.getByTestId('statement-done')).toBeVisible();
  }

  step('event card, questions and answers');
  for (const who of [teacher, ...students]) await expect(who.page.locator('.event-card')).toBeVisible();
  await students[3].page.getByRole('tab', { name: '입장 발표' }).click();
  await expect(students[3].page.getByTestId('statement-row')).toHaveCount(6);
  for (const student of students) await student.page.getByRole('tab', { name: /토론 채팅/ }).click();
  const s0 = students[0].page;
  await s0.getByRole('radio', { name: '질문' }).click();
  await s0.getByLabel('받는 사람').selectOption({ label: students[1].nickname });
  await s0.getByLabel('질문 입력').fill('진짜 그렇게 생각하세요? 급한 연락은 어떻게 하죠?');
  await s0.getByRole('button', { name: '보내기' }).click();
  const s1 = students[1].page;
  await expect(s1.getByTestId('chat-message')).toHaveCount(1);
  await s1.getByRole('radio', { name: '답변' }).click();
  await s1.getByLabel('답변 입력').fill('담임 선생님을 통해 연락하면 된다고 봐요.');
  await s1.getByRole('button', { name: '보내기' }).click();
  await students[2].page.getByLabel('사건 대응 입력').fill('수행평가 중에는 선생님이 대신 확인해 주면 좋겠어요.');
  await students[2].page.getByRole('button', { name: '보내기' }).click();
  await expect(teacher.page.getByTestId('chat-message')).toHaveCount(3);
  await shot(students[1], 'student-event-chat');
  await shot(teacher, 'teacher-event');

  step('a student reloads and returns to the same phase and role');
  await students[2].page.reload();
  await expect(phaseTitle(students[2])).toContainText('사건·질문');
  await expect(students[2].page.getByTestId('role-chip')).toContainText(students[2].roleName);

  step('teacher pauses, resumes and moves to rebuttal');
  await teacher.page.getByRole('button', { name: '일시정지' }).click();
  await expect(students[4].page.locator('.todo-callout.paused')).toBeVisible();
  await teacher.page.getByRole('button', { name: '재개' }).click();
  await expect(students[4].page.locator('.todo-callout.paused')).toHaveCount(0);
  await teacher.page.getByTestId('next-phase').click();
  for (const student of students) await expect(phaseTitle(student)).toContainText('반론');
  await students[3].page.getByLabel('받는 사람').selectOption({ label: students[2].nickname });
  await students[3].page.getByLabel('반론 입력').fill('선생님이 대신 확인하면 사생활 문제가 생길 수 있어요.');
  await students[3].page.getByRole('button', { name: '보내기' }).click();
  await expect(teacher.page.getByTestId('chat-message')).toHaveCount(4);

  step('vote for the switcher');
  await teacher.page.getByTestId('next-phase').click();
  for (const student of students) {
    await expect(phaseTitle(student)).toContainText('투표');
    const target = student === switcher ? students.find((s) => s !== switcher) : switcher;
    await student.page.locator('.candidate', { hasText: target.nickname }).click();
    if (student === students[5]) await shot(student, 'student-vote');
    await student.page.getByRole('button', { name: '이대로 투표하기' }).click();
  }

  step('reveal and end; no real-opinion step afterwards');
  for (const who of [teacher, ...students]) {
    await expect(who.page.getByTestId('reveal')).toBeVisible();
    await expect(who.page.locator('.switcher-name strong')).toHaveText(switcher.nickname);
    await expect(who.page.locator('body')).not.toContainText(/1순위|2순위|최종 의견|진짜 의견|입장 변화/);
  }
  await expect(students[0].page.getByTestId('reveal')).toContainText('역할 전환자를 찾아냈어요');
  await shot(students[0], 'student-reveal');
  await teacher.page.getByRole('button', { name: '게임 종료' }).click();
  await expect(teacher.page.getByTestId('game-summary')).toContainText('참여 인원 6명');
  await expect(students[0].page.getByText('게임이 끝났어요. 참여해 줘서 고마워요!').first()).toBeVisible();
  await expect(students[0].page.locator('textarea')).toHaveCount(0);
  await shot(teacher, 'teacher-ended');

  expect(pageErrors).toEqual([]);
  step('PASS');
} catch (error) {
  console.error(error);
  console.error('page errors:', pageErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
