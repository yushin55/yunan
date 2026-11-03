// Local emulator only. Never configure this test with real project credentials.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, onSnapshot, terminate, setLogLevel } from 'firebase/firestore';

const projectId = 'demo-yunan';
const api = 'http://127.0.0.1:8000';
const clients = [];
let teacher, student, outsider, room;
setLogLevel('silent');

async function client(name, project = projectId) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: project, appId: 'demo-app' }, `smoke-${name}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const user = (await signInAnonymously(auth)).user;
  const value = { app, auth, db, user };
  clients.push(value);
  return value;
}
async function request(who, path, body) {
  const response = await fetch(api + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${await who.user.getIdToken()}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  [teacher, student, outsider] = await Promise.all(['teacher', 'student', 'outsider'].map(name => client(name)));
});
after(async () => {
  await Promise.all(clients.map(async ({ app, db }) => { await terminate(db); await deleteApp(app); }));
});

test('anonymous Web SDK identity is accepted by Admin SDK and creates persistent documents', async () => {
  const result = await request(teacher, '/api/rooms', { topicId: 'school_cctv' });
  assert.equal(result.status, 200);
  room = result.data.room;
  assert.equal(room.hostUid, teacher.user.uid);
  assert.equal((await getDoc(doc(teacher.db, `rooms/${room.roomId}`))).data().hostUid, teacher.user.uid);
});
test('student join emits a server-backed realtime update to the teacher', async () => {
  let stop;
  let timer;
  const received = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Realtime server update timed out')), 15000);
    stop = onSnapshot(doc(teacher.db, `rooms/${room.roomId}`), snapshot => {
      if (!snapshot.metadata.fromCache && snapshot.data()?.participantCount === 1) resolve();
    }, reject);
  });
  try {
    const result = await request(student, '/api/rooms/join', { nickname: '테스트학생', code: room.code });
    assert.equal(result.status, 200);
    assert.equal(result.data.me.uid, student.user.uid);
    await received;
  } finally { clearTimeout(timer); stop?.(); }
});
test('fresh API read and forced token refresh retain the same student and room', async () => {
  await student.user.getIdToken(true);
  const result = await request(student, `/api/rooms/${room.roomId}/me`);
  assert.equal(result.status, 200);
  assert.equal(result.data.me.uid, student.user.uid);
  assert.equal(result.data.room.roomId, room.roomId);
  assert.equal((await getDoc(doc(student.db, `rooms/${room.roomId}/participants/${student.user.uid}`))).data().nickname, '테스트학생');
});
test('unauthenticated API and outsider access are denied', async () => {
  assert.equal((await request(null, `/api/rooms/${room.roomId}/me`)).status, 401);
  assert.equal((await request(outsider, `/api/rooms/${room.roomId}/me`)).status, 403);
  await assert.rejects(getDoc(doc(outsider.db, `rooms/${room.roomId}`)), e => e.code === 'permission-denied');
});
test('student cannot invoke teacher actions or read server state', async () => {
  assert.equal((await request(student, `/api/rooms/${room.roomId}/start`, {})).status, 403);
  await assert.rejects(getDoc(doc(student.db, `rooms/${room.roomId}/internal/state`)), e => e.code === 'permission-denied');
});
test('authenticated Web SDK direct writes are denied', async () => {
  await assert.rejects(setDoc(doc(teacher.db, `rooms/${room.roomId}`), { phase: 'reveal' }), e => e.code === 'permission-denied');
  assert.equal((await getDoc(doc(teacher.db, `rooms/${room.roomId}`))).data().phase, 'lobby');
});
test('a different emulator project token is rejected by the backend', async () => {
  // Auth emulator may map the same demo API key to its default project.
  // Alter only the in-memory emulator token claims to exercise audience checking.
  const token = await teacher.user.getIdToken();
  const [header, payload] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.aud, projectId);
  claims.aud = 'demo-yunan-other';
  claims.iss = 'https://securetoken.google.com/demo-yunan-other';
  const wrongProjectToken = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`;
  const mismatched = { user: { getIdToken: async () => wrongProjectToken } };
  assert.equal((await request(mismatched, `/api/rooms/${room.roomId}/me`)).status, 401);
});
test('runtime CORS allows the configured frontend and rejects an unrelated origin', async () => {
  const preflight = origin => fetch(`${api}/api/rooms`, {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
  });
  const allowed = await preflight('http://127.0.0.1:5173');
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  const denied = await preflight('https://unrelated.invalid');
  assert.equal(denied.status, 400);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
