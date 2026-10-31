import { after, before, describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  setLogLevel,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

// Isolated from the live demo-yunan game. Start emulators with `npm run emulators`,
// then run `npm run test:rules`.
const projectId = 'demo-yunan-rules';
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const emulatorUrl = new URL(`http://${emulatorAddress}`);
const roomId = 'rules-room';
const otherRoomId = 'rules-other-room';
const base = `rooms/${roomId}`;
let environment;
let teacher;
let alice;
let bob;
let outsider;
let anonymous;

setLogLevel('silent');

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: emulatorUrl.hostname,
      port: Number(emulatorUrl.port),
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  await environment.clearFirestore();
  teacher = environment.authenticatedContext('teacher').firestore();
  alice = environment.authenticatedContext('alice').firestore();
  bob = environment.authenticatedContext('bob').firestore();
  outsider = environment.authenticatedContext('outsider').firestore();
  anonymous = environment.unauthenticatedContext().firestore();

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (const id of [roomId, otherRoomId]) {
      const root = `rooms/${id}`;
      batch.set(doc(db, root), { hostUid: id === roomId ? 'teacher' : 'other-teacher', phase: 'event', phaseVersion: 4, topicId: 'school_cctv' });
      for (const uid of ['alice', 'bob']) {
        if (id === otherRoomId && uid === 'alice') continue;
        batch.set(doc(db, `${root}/participants/${uid}`), { uid, nickname: uid, seat: 0, prefsDone: true, roleId: 'cctv_student_rep' });
        batch.set(doc(db, `${root}/privatePlayers/${uid}`), {
          preferences: { first: 'cctv_student_rep', second: 'cctv_parent_rep' },
          roleId: 'cctv_student_rep',
          isSwitcher: uid === 'bob',
          notices: [],
        });
      }
      batch.set(doc(db, `${root}/publicRounds/chat`), { items: [] });
      batch.set(doc(db, `${root}/host/state`), { moderation: [], teacherGuide: { summary: 'guide' } });
      batch.set(doc(db, `${root}/internal/state`), { votes: { alice: ['bob'] } });
    }
    await batch.commit();
  });
});

after(async () => {
  await environment?.cleanup();
});

describe('room membership', () => {
  test('students and the teacher read the room, participants and public rounds', async () => {
    for (const db of [teacher, alice, bob]) {
      await assertSucceeds(getDoc(doc(db, base)));
      await assertSucceeds(getDocs(collection(db, `${base}/participants`)));
      await assertSucceeds(getDoc(doc(db, `${base}/publicRounds/chat`)));
    }
  });

  test('outsiders, anonymous users and other rooms are denied', async () => {
    for (const db of [outsider, anonymous]) {
      await assertFails(getDoc(doc(db, base)));
      await assertFails(getDocs(collection(db, `${base}/participants`)));
      await assertFails(getDoc(doc(db, `${base}/publicRounds/chat`)));
    }
    await assertFails(getDoc(doc(alice, `rooms/${otherRoomId}`)));
    await assertFails(getDoc(doc(teacher, `rooms/${otherRoomId}/participants/bob`)));
    await assertFails(getDocs(collection(alice, 'rooms')));
  });
});

describe('private data', () => {
  test('a student reads only their own preferences and switcher status', async () => {
    await assertSucceeds(getDoc(doc(alice, `${base}/privatePlayers/alice`)));
    await assertFails(getDoc(doc(alice, `${base}/privatePlayers/bob`)));
    await assertFails(getDocs(collection(alice, `${base}/privatePlayers`)));
    await assertFails(getDocs(collectionGroup(alice, 'privatePlayers')));
  });

  test('the teacher cannot read any student preference or switcher status', async () => {
    await assertFails(getDoc(doc(teacher, `${base}/privatePlayers/alice`)));
    await assertFails(getDoc(doc(teacher, `${base}/privatePlayers/bob`)));
    await assertFails(getDocs(collection(teacher, `${base}/privatePlayers`)));
  });

  test('only the teacher reads the moderation queue', async () => {
    await assertSucceeds(getDoc(doc(teacher, `${base}/host/state`)));
    for (const db of [alice, bob, outsider]) await assertFails(getDoc(doc(db, `${base}/host/state`)));
  });

  test('nobody reads the server aggregate with votes', async () => {
    for (const db of [teacher, alice, bob]) await assertFails(getDoc(doc(db, `${base}/internal/state`)));
  });
});

describe('writes', () => {
  test('every client write is denied; the server is the only writer', async () => {
    for (const db of [teacher, alice]) {
      await assertFails(updateDoc(doc(db, base), { phase: 'reveal' }));
      await assertFails(setDoc(doc(db, `${base}/participants/alice`), { roleId: 'cctv_parent_rep' }));
      await assertFails(updateDoc(doc(db, `${base}/privatePlayers/alice`), { isSwitcher: false }));
      await assertFails(setDoc(doc(db, `${base}/publicRounds/chat`), { items: [{ text: 'unmoderated' }] }));
      await assertFails(deleteDoc(doc(db, `${base}/host/state`)));
      await assertFails(setDoc(doc(db, 'rooms/new-room'), { hostUid: 'alice' }));
    }
  });
});
