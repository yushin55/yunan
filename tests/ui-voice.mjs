import { chromium, expect as baseExpect } from '@playwright/test';
import { mkdir, readdir, writeFile } from 'node:fs/promises';

// Many browsers on one machine can be slow; a late answer is not a failure.
const expect = baseExpect.configure({ timeout: 30000 });
import path from 'node:path';

// The whole microphone path with real audio: a recorded Korean narration plays through Chromium's
// fake microphone on a student's device. The student presses Z, the page cuts what it hears into
// clips, the server transcribes them with Gemini and they appear under that student's name; the AI
// then boils the statement down to one line for their card.
// Needs the web server, the API with GEMINI_API_KEY and the emulators. It makes paid AI calls.
const origin = process.env.BRIDGE_UI_URL || 'http://localhost:5173';
const apiBase = process.env.BRIDGE_API_URL || 'http://localhost:8000';
const authBase = process.env.BRIDGE_AUTH_EMULATOR || 'http://127.0.0.1:9099';
await mkdir('artifacts', { recursive: true });

// The fake microphone only reads WAV, so decode one of the bundled narration clips.
const dir = 'frontend/public/audio/briefing/school_cctv';
const clip = (await readdir(dir)).find((name) => name.startsWith('scene1-'));
const decoder = await chromium.launch({ headless: true });
const decoded = await (await decoder.newPage()).evaluate(async (source) => {
  const context = new OfflineAudioContext(1, 1, 48000);
  const audio = await context.decodeAudioData(Uint8Array.from(atob(source), (c) => c.charCodeAt(0)).buffer);
  return { rate: audio.sampleRate, samples: Array.from(audio.getChannelData(0), (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767)) };
}, (await import('node:fs')).readFileSync(path.join(dir, clip)).toString('base64'));
await decoder.close();
const pcm = Buffer.from(Int16Array.from(decoded.samples).buffer);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(decoded.rate, 24);
header.writeUInt32LE(decoded.rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
const wav = path.resolve('artifacts/fake-microphone.wav');
await writeFile(wav, Buffer.concat([header, pcm]));

const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'],
});

async function signUp() {
  const response = await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const body = await response.json();
  return body.idToken;
}

async function post(token, route, body = {}) {
  const response = await fetch(apiBase + route, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${route}: ${response.status} ${await response.text()}`);
  return response.json();
}

try {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await context.addInitScript(() => localStorage.setItem('bridge.table3d', 'off'));
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  // The teacher and five students go through the API: this test is about one student's microphone.
  const teacher = await signUp();
  const created = await post(teacher, '/api/rooms', { topicId: 'school_cctv' });
  const roomId = created.room.roomId;
  const roles = created.room.topic.roles.map((r) => r.id);
  await page.goto(`${origin}/join?code=${created.room.code}`);
  await page.getByLabel('이름').fill('음성학생');
  await page.getByRole('button', { name: '입장하기' }).click();
  await page.waitForURL(/\/room\//);
  // Past the briefing and the rules: seat one, so this student speaks first.
  await page.getByTestId('briefing-play').click();
  await expect(page.getByTestId('briefing-headline')).toBeVisible({ timeout: 10000 });
  for (let i = 0; i < 8 && !(await page.getByTestId('video-end').count()); i++) await page.getByTestId('briefing-next').click({ force: true });
  await page.getByTestId('video-next').click();
  await page.getByTestId('rules-play').click();
  await page.getByTestId('video-skip').click({ force: true });
  await page.getByTestId('video-next').click();
  for (const i of [0, 1]) {
    await page.locator('.rack-item').nth(i).click();
    await page.getByTestId('wardrobe-add').click();
  }
  await page.getByTestId('wardrobe-submit').click();
  const others = [];
  for (let i = 0; i < 5; i++) {
    const token = await signUp();
    await post(token, '/api/rooms/join', { nickname: `상대${i + 1}`, code: created.room.code });
    await post(token, `/api/rooms/${roomId}/preferences`, i < 2 ? { first: roles[0], second: roles[1] } : { first: roles[i - 1], second: roles[4] });
    others.push(token);
  }
  await post(teacher, `/api/rooms/${roomId}/start`);
  await page.getByRole('button', { name: '역할을 확인했어요' }).click();
  for (const token of others) await post(token, `/api/rooms/${roomId}/confirm-role`);
  await expect(page.getByTestId('mic-statement')).toBeEnabled({ timeout: 15000 });
  await post(teacher, `/api/rooms/${roomId}/extend`, { seconds: 120 }); // Room for several clips.

  // Nothing is heard before pressing; pressing asks once, then listens.
  const mic = page.getByTestId('mic-controls');
  await expect(mic).toHaveAttribute('data-live', 'false');
  await page.keyboard.press('z');
  await expect(page.getByTestId('mic-confirm')).toContainText('마이크 켜기');
  await page.screenshot({ path: 'artifacts/voice-notice.png' });
  await page.getByTestId('mic-confirm').click();
  await expect(mic).toHaveAttribute('data-status', 'on');
  await expect(mic).toHaveAttribute('data-live', 'true');
  await page.screenshot({ path: 'artifacts/voice-listening.png' });

  // Someone else cannot take the microphone meanwhile, nor send audio under it.
  const denied = await fetch(`${apiBase}/api/rooms/${roomId}/mic-on`, { method: 'POST', headers: { Authorization: `Bearer ${others[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'statement' }) });
  if (denied.status !== 409) throw new Error(`mic-on while taken: ${denied.status}`);

  // Words from the narration come back as text under this student's number.
  // If the AI check is slow or unavailable the line waits for the teacher instead of appearing: approve it.
  const item = page.getByTestId('statement-item').first();
  const reviewed = new Set();
  const heard = async () => {
    const state = await post(teacher, `/api/rooms/${roomId}/sync`);
    for (const entry of state.host.moderation) {
      if (entry.status !== 'pending_review' || reviewed.has(entry.id)) continue;
      reviewed.add(entry.id);
      console.log('held for the teacher, approving:', entry.text);
      await post(teacher, `/api/rooms/${roomId}/review`, { entryId: entry.id, decision: 'approve' });
    }
    return state.rounds.transcript.length;
  };
  await expect.poll(heard, { timeout: 120000, intervals: [3000] }).toBeGreaterThan(0);
  await expect(item).toContainText(/학교|CCTV|시시티비|출입문|복도|교실|목소리|법/, { timeout: 60000 });
  console.log('transcribed:', (await item.textContent()).trim());

  // Pressing again closes the microphone and hands over to the next person.
  await page.keyboard.press('z');
  await expect(mic).toHaveAttribute('data-live', 'false');
  await expect(mic).toHaveAttribute('data-status', 'off');
  await expect(page.getByTestId('floor-name')).toHaveText('상대1');

  // The AI boils the statement down to one line for the card; the teacher's screen normally asks for this.
  await expect.poll(async () => (await post(teacher, `/api/rooms/${roomId}/summary`)).rounds.summary?.statements?.length ?? 0, { timeout: 90000, intervals: [5000] }).toBeGreaterThan(0);
  const summary = (await post(teacher, `/api/rooms/${roomId}/sync`)).rounds.summary;
  console.log('summarized:', JSON.stringify(summary.statements));
  await expect(item).toContainText(summary.statements[0].text);
  await page.screenshot({ path: 'artifacts/voice-card.png' });

  if (errors.length) throw new Error(errors.join(' | '));
  console.log('PASS voice');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
