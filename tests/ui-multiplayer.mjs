import { chromium, devices, expect as baseExpect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Many browsers on one machine can be slow; a late answer is not a failure.
const expect = baseExpect.configure({ timeout: 30000 });

// Requires the frontend, the FastAPI server and the Auth/Firestore emulators.
// One teacher (desktop) and six students (mobile), each in an isolated browser context.
// Every move is made through the UI. Run the API with MODERATION_MODE=rules and no GEMINI_API_KEY.
// Students take the one microphone from their own phones, but these browsers have no microphone to
// open: what is said is typed by the teacher. The real audio path has its own test (ui-voice.mjs).
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
  // A blocked or slow font server must not hold up the page's load event.
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`${name}: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource|permission-denied|Could not reach Cloud Firestore|ERR_FAILED/.test(msg.text())) pageErrors.push(`${name}: ${msg.text()}`);
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
  for (let i = 0; i < 8 && !(await page.getByTestId('video-end').count()); i++) await page.getByTestId('briefing-next').click({ force: true });
  await page.getByTestId('video-next').click(); // The last frame offers replay or the next step.
  // The rules video, stepped through scene by scene, unlocks role picking.
  await page.getByTestId('rules-play').click();
  for (let i = 0; i < 10 && !(await page.getByTestId('video-end').count()); i++) {
    await page.getByTestId('briefing-next').click({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
  }
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


try {
  step('teacher creates a room');
  const teacher = await open('teacher', { viewport: { width: 1400, height: 950 } });
  await teacher.page.goto(`${origin}/teacher/new`);
  await teacher.page.getByRole('radio', { name: /수업 중 학생의 스마트폰/ }).click();
  await teacher.page.getByTestId('create-room').click();
  await teacher.page.waitForURL(/\/room\//);
  const code = (await teacher.page.getByTestId('room-code').first().textContent()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // Generous clocks so a slow machine does not lose the race; one person's microphone is short enough to watch expire.
  for (const [name, seconds] of [[/역할 확인/, 300], [/입장 발표/, 300], [/사건 공개/, 600], [/^반론/, 300], [/역할 전환자 투표/, 300], [/1번 말할 때/, 20]]) await teacher.page.getByRole('spinbutton', { name }).fill(String(seconds));
  await teacher.page.getByRole('button', { name: '설정 저장' }).click();
  await expect(teacher.page.getByRole('button', { name: '설정 저장' })).toBeDisabled();

  step('six students join with their names');
  const students = [];
  for (let i = 0; i < 6; i++) {
    const student = await open(`student${i}`, { ...devices['Pixel 7'] });
    // Six software-rendered 3D tables can starve the machine; the phones work the same without them.
    await student.context.addInitScript(() => localStorage.setItem('bridge.table3d', 'off'));
    student.nickname = `학생${i + 1}`;
    await student.page.goto(`${origin}/join?code=${code}`);
    await student.page.getByLabel('이름').fill(student.nickname);
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

  // Takes the microphone from a student's phone, reading the notice the first time.
  const take = async (student, kind) => {
    await student.page.getByTestId(`mic-${kind}`).click();
    if (!student.noticed) await student.page.getByTestId('mic-confirm').click();
    student.noticed = true;
    await expect(student.page.getByTestId(`mic-${kind}`)).toHaveAttribute('aria-pressed', 'true');
  };
  const say = async (text) => {
    await teacher.page.getByTestId('line-input').fill(text);
    await teacher.page.getByTestId('line-add').click();
  };
  const speakerNow = async () => {
    const name = (await teacher.page.getByTestId('current-speaker').textContent()).trim();
    return students.find((s) => s.nickname === name);
  };
  const micFree = () => expect(teacher.page.getByTestId('speaker-eyebrow')).toContainText('마이크가 비어');

  step('statements: in seat order, only the speaker can switch on');
  for (const student of students) {
    await expect(phaseTitle(student)).toContainText('입장 발표');
    await expect(student.page.getByTestId('line-input')).toHaveCount(0); // Nobody types what is said.
    await expect(student.page.locator('textarea')).toHaveCount(1); // Only the small memo.
    await expect(student.page.getByTestId('statement-item')).toHaveCount(6);
  }
  // A rude line never reaches the shared record; only the teacher gets to see it.
  await say('닥쳐 너희는 다 틀렸어');
  await expect(teacher.page.getByTestId('moderation-toggle')).toContainText('확인 필요 1');
  await expect(teacher.page.locator('.transcript')).not.toContainText('닥쳐');
  for (const [i, student] of students.entries()) {
    const speaker = await speakerNow();
    expect(speaker).toBe(student); // Seat order.
    const other = students[(i + 1) % 6];
    await expect(speaker.page.getByTestId('mic-statement')).toBeEnabled();
    await expect(other.page.getByTestId('floor-name')).toHaveText(speaker.nickname);
    await expect(other.page.getByTestId('mic-statement')).toBeDisabled();
    await expect(other.page.getByTestId('end-turn')).toHaveCount(0);
    await say(`저는 ${speaker.roleName}로서 규칙에 예외가 필요하다고 생각합니다. (${i + 1})`);
    await expect(teacher.page.getByTestId('transcript-turn')).toHaveCount(i + 1);
    await expect(teacher.page.getByTestId('transcript-turn').nth(i)).toContainText(speaker.nickname);
    // Everyone's list, and the card behind it, fills in under that person's number.
    await expect(other.page.getByTestId('statement-item').nth(i)).toContainText(`(${i + 1})`);
    if (i === 1) await shot(teacher, 'teacher-statement');
    if (i === 1) await shot(speaker, 'student-my-turn');
    if (i === 1) await shot(other, 'student-next-up');
    if (i === 0) {
      // Pressing once starts and pressing again finishes, handing over to the next person.
      await take(speaker, 'statement');
      await expect(teacher.page.getByTestId('speaker-eyebrow')).toContainText('마이크 켜짐');
      await expect(speaker.page.getByTestId('end-turn')).toHaveCount(0);
      await speaker.page.getByTestId('mic-statement').click();
    } else await speaker.page.getByTestId('end-turn').click();
    if (i < 5) await expect(teacher.page.getByTestId('current-speaker')).toHaveText(students[i + 1].nickname);
  }

  step('event card; the floor is open and there is one microphone');
  for (const who of [teacher, ...students]) await expect(who.page.locator('.event-card')).toBeVisible();
  await micFree();
  await expect(teacher.page.getByTestId('call-speaker')).toHaveCount(0);
  await expect(teacher.page.getByTestId('line-input')).toHaveCount(0); // Nobody is talking, so there is nobody to write for.
  // Two phones press at the same moment: one gets it and the other is told who did.
  const [a, b, c] = [students[1], students[3], students[5]];
  await Promise.all([a, b].map((s) => s.page.getByTestId('mic-question').click()));
  await Promise.all([a, b].map((s) => s.page.getByTestId('mic-confirm').click()));
  a.noticed = b.noticed = true;
  await expect(teacher.page.getByTestId('speaker-eyebrow')).toContainText('지금 말하는 사람 · 질문');
  const asker = await speakerNow();
  const loser = asker === a ? b : a;
  await expect(asker.page.getByTestId('mic-question')).toHaveAttribute('aria-pressed', 'true');
  await expect(loser.page.getByTestId('mic-question')).toHaveAttribute('aria-pressed', 'false');
  await expect(loser.page.getByRole('alert').first()).toContainText(`${asker.nickname}님이 말하고 있어요`);
  // Everyone else's buttons wait, and so does the asker's other one.
  for (const student of students) await expect(student.page.getByTestId('mic-answer')).toBeDisabled();
  await expect(c.page.getByTestId('mic-question')).toBeDisabled();
  await expect(c.page.getByTestId('floor-name')).toHaveText(asker.nickname);
  await shot(c, 'student-locked');
  await say('진짜 그렇게 생각하세요? 급한 연락은 어떻게 하죠?');
  for (const student of [asker, loser, c]) await expect(student.page.getByTestId('exchange-row').last()).toContainText(`${student === asker ? '나' : asker.nickname} 질문`);
  await expect(c.page.getByTestId('exchange-row').last()).toContainText('급한 연락은');
  await asker.page.getByTestId('mic-question').click();
  await micFree();
  await take(c, 'answer');
  await expect(teacher.page.getByTestId('speaker-eyebrow')).toContainText('답변');
  await say('담임 선생님을 통해 연락하면 된다고 봐요.');
  await expect(loser.page.getByTestId('exchange-row').last()).toContainText(`${c.nickname} 답변`);
  await expect(loser.page.getByTestId('exchange-row').last()).toContainText('담임 선생님');
  await expect(teacher.page.getByTestId('transcript-turn').nth(6)).toContainText(asker.nickname);
  await expect(teacher.page.getByTestId('transcript-turn').nth(6)).toContainText('질문');
  await expect(teacher.page.getByTestId('transcript-turn').nth(7)).toContainText(c.nickname);
  await expect(teacher.page.getByTestId('transcript-turn').nth(7)).toContainText('답변');
  await shot(teacher, 'teacher-event');
  await shot(loser, 'student-event');
  await c.page.getByTestId('mic-answer').click();
  await micFree();

  step('the teacher corrects a line; students see the correction');
  await teacher.page.getByTestId('transcript-line').nth(7).getByRole('button', { name: '이 발언 고치기' }).click();
  await teacher.page.getByRole('textbox', { name: '발언 고치기' }).fill('담임 선생님께 먼저 연락하면 된다고 봐요.');
  await teacher.page.getByRole('button', { name: '고친 내용 저장' }).click();
  const reader = loser;
  await expect(reader.page.getByTestId('exchange-feed')).toContainText('담임 선생님께 먼저');
  await reader.page.locator('details', { hasText: '전체 발언 기록' }).first().locator('summary').click();
  await expect(reader.page.locator('.transcript')).toContainText('담임 선생님께 먼저');
  await expect(reader.page.locator('.line-tools')).toHaveCount(0); // Only the teacher edits.
  await expect(reader.page.locator('.transcript')).not.toContainText('닥쳐');

  step('the time limit frees the microphone by itself');
  await take(a, 'question');
  await expect(teacher.page.getByTestId('current-speaker')).toHaveText(a.nickname);
  await expect(b.page.getByTestId('mic-question')).toBeDisabled();
  await micFree(); // Twenty seconds later, with nobody pressing anything.
  await expect(a.page.getByTestId('mic-question')).toHaveAttribute('aria-pressed', 'false');
  await expect(b.page.getByTestId('mic-question')).toBeEnabled();

  step('a student reloads and returns to the same phase and role');
  await students[2].page.reload();
  await expect(phaseTitle(students[2])).toContainText('사건·질문');
  await expect(students[2].page.getByTestId('role-chip')).toContainText(students[2].roleName);
  await expect(students[2].page.locator('#memo-text')).toBeVisible();

  step('reloading while talking gives the microphone back');
  await take(b, 'question');
  await expect(teacher.page.getByTestId('current-speaker')).toHaveText(b.nickname);
  await b.page.reload();
  await micFree();

  step('teacher pauses with the microphone on, resumes and moves to rebuttal');
  await take(a, 'question');
  await teacher.page.getByRole('button', { name: '일시정지' }).click();
  await expect(students[4].page.locator('.todo-callout.paused')).toBeVisible();
  await expect(a.page.getByTestId('mic-question')).toHaveAttribute('aria-pressed', 'false');
  await expect(a.page.getByTestId('mic-question')).toBeDisabled();
  await teacher.page.getByRole('button', { name: '재개' }).click();
  await expect(students[4].page.locator('.todo-callout.paused')).toHaveCount(0);
  await micFree();
  await teacher.page.getByTestId('next-phase').click();
  for (const student of students) await expect(phaseTitle(student)).toContainText('반론');
  await take(c, 'rebuttal');
  await say('선생님이 대신 확인하면 사생활 문제가 생길 수 있어요.');
  await expect(teacher.page.locator('.transcript')).toContainText('사생활 문제');
  await expect(a.page.getByTestId('exchange-row').last()).toContainText(`${c.nickname} 반론`);
  await c.page.getByTestId('mic-rebuttal').click();
  await micFree();

  step('classroom display hides the teacher panels');
  await teacher.page.getByTestId('present-toggle').click();
  await expect(teacher.page.locator('.teacher-side')).toBeHidden();
  await expect(teacher.page.getByTestId('review-badge')).toContainText('1');
  await expect(teacher.page.locator('body')).not.toContainText('닥쳐');
  await shot(teacher, 'teacher-classroom');
  await teacher.page.getByTestId('present-toggle').click();

  step('the teacher decides about the held line');
  await teacher.page.getByTestId('moderation-toggle').click();
  await expect(teacher.page.getByTestId('moderation-entry')).toContainText('닥쳐');
  await teacher.page.getByRole('button', { name: '공개하지 않기' }).click();
  // Nothing left to review: the moderation panel steps aside until the next held line.
  await expect(teacher.page.getByTestId('moderation-toggle')).toHaveCount(0);

  step('vote for the switcher');
  await teacher.page.getByTestId('next-phase').click();
  await expect(teacher.page.getByTestId('transcript-panel')).toBeVisible(); // Still there to look back on.
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
  await expect(students[0].page.locator('textarea')).toHaveCount(0); // The memo was for the discussion.
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
