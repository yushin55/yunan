import assert from 'node:assert/strict';
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
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

// Isolate security fixtures from the live demo-yunan game and API integration tests.
// Start local emulators with `npm run emulators`, then run `npm run test:rules`.
const projectId = 'demo-yunan-rules';
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const emulatorUrl = new URL(`http://${emulatorAddress}`);
const roomId = 'rules-active-room';
const completedRoomId = 'rules-completed-room';
const foreignRoomId = 'rules-other-room';
const roomPath = (id = roomId) => `rooms/${id}`;
let environment;
let alice;
let bob;
let outsider;
let anonymous;

// Expected denials are test results, not useful SDK warning messages.
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
  alice = environment.authenticatedContext('alice').firestore();
  bob = environment.authenticatedContext('bob').firestore();
  outsider = environment.authenticatedContext('outsider').firestore();
  anonymous = environment.unauthenticatedContext().firestore();

  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (const id of [roomId, completedRoomId]) {
      const base = roomPath(id);
      batch.set(doc(db, base), {
        hostUid: 'alice',
        phase: id === completedRoomId ? 'results' : 'claim',
        phaseVersion: 4,
        topicId: 'teacher_protection',
        topicVersion: 1,
        participantCount: 2,
      });
      for (const uid of ['alice', 'bob']) {
        batch.set(doc(db, `${base}/participants/${uid}`), {
          uid,
          nickname: uid,
          ready: true,
          roleId: `teacher_protection_${uid === 'alice' ? 'teacher' : 'parent'}`,
        });
        batch.set(doc(db, `${base}/privatePlayers/${uid}`), {
          initial: { position: 'oppose', reason: `${uid}-private-initial-reason` },
          preferences: ['teacher_protection_parent', 'teacher_protection_teacher'],
          switched: uid === 'bob',
          cards: [{ id: `private-card-for-${uid}` }],
          reflection: { opinion: `${uid}-private-final-opinion`, share: false },
        });
        batch.set(doc(db, `${base}/results/${uid}`), {
          total: 70,
          initial: `${uid}-private-initial-reason`,
          reflection: `${uid}-private-final-opinion`,
        });
      }
      batch.set(doc(db, `${base}/publicRounds/claim`), {
        items: [{ uid: 'alice', text: 'A published game-role statement.' }],
      });
      batch.set(doc(db, `${base}/internal/state`), {
        submissions: { bob: { text: 'Unpublished statement.' } },
        guesses: { alice: { targetUid: 'bob', reason: 'Private guess.' } },
        ratings: { bob: { targetUid: 'alice', accuracy: 5 } },
        reports: { alice: { detail: 'Private report.' } },
      });
      // Deny-by-default must also protect future/legacy private collections.
      for (const name of ['submissions', 'guesses', 'ratings', 'reports']) {
        batch.set(doc(db, `${base}/${name}/alice`), { ownerUid: 'alice', secret: true });
      }
    }
    batch.set(doc(db, `${roomPath(completedRoomId)}/publicRounds/reveal`), {
      items: [{ uid: 'bob', switched: true, roleId: 'teacher_protection_parent' }],
    });
    batch.set(doc(db, roomPath(foreignRoomId)), { hostUid: 'outsider', phase: 'lobby' });
    batch.set(doc(db, `${roomPath(foreignRoomId)}/participants/outsider`), {
      uid: 'outsider', nickname: 'Other room member',
    });
    batch.set(doc(db, 'roomCodes/hashed-code'), { roomId });
    batch.set(doc(db, 'topics/teacher_protection'), { active: true, version: 1 });
    await batch.commit();
  });
}, { timeout: 30000 });

after(async () => {
  if (environment) {
    await environment.clearFirestore();
    await environment.cleanup();
  }
});

describe('Room membership and public game subscriptions', () => {
  test('an unauthenticated browser and a signed-in nonmember cannot open a room', async () => {
    await assertFails(getDoc(doc(anonymous, roomPath())));
    await assertFails(getDoc(doc(outsider, roomPath())));
    await assertFails(getDocs(collection(outsider, `${roomPath()}/participants`)));
    await assertFails(getDocs(collection(outsider, `${roomPath()}/publicRounds`)));
  });

  test('room members can read the room and subscribe to its public collections', async () => {
    const room = await assertSucceeds(getDoc(doc(alice, roomPath())));
    assert.equal(room.data().phase, 'claim');
    const players = await assertSucceeds(getDocs(collection(bob, `${roomPath()}/participants`)));
    assert.equal(players.size, 2);
    const rounds = await assertSucceeds(getDocs(collection(bob, `${roomPath()}/publicRounds`)));
    assert.equal(rounds.docs[0].data().items[0].uid, 'alice');
  });

  test('membership in one room grants no access to another room', async () => {
    await assertFails(getDoc(doc(alice, roomPath(foreignRoomId))));
    await assertFails(getDoc(doc(alice, `${roomPath(foreignRoomId)}/participants/outsider`)));
    await assertSucceeds(getDoc(doc(outsider, roomPath(foreignRoomId))));
  });

  test('a member cannot enumerate rooms or resolve the private invitation-code index', async () => {
    await assertFails(getDocs(collection(alice, 'rooms')));
    await assertFails(getDoc(doc(alice, 'roomCodes/hashed-code')));
    await assertFails(getDocs(collection(alice, 'roomCodes')));
  });
});

describe('Private opinions, pending submissions, and personal results', () => {
  test('a player can retrieve only their own private player document', async () => {
    const own = await assertSucceeds(getDoc(doc(alice, `${roomPath()}/privatePlayers/alice`)));
    assert.equal(own.data().initial.reason, 'alice-private-initial-reason');
    await assertFails(getDoc(doc(alice, `${roomPath()}/privatePlayers/bob`)));
    await assertFails(getDoc(doc(bob, `${roomPath()}/privatePlayers/alice`)));
    await assertFails(getDoc(doc(outsider, `${roomPath()}/privatePlayers/alice`)));
  });

  test('private collections cannot be enumerated, even with a query for the caller', async () => {
    await assertFails(getDocs(collection(alice, `${roomPath()}/privatePlayers`)));
    await assertFails(getDocs(query(
      collection(alice, `${roomPath()}/privatePlayers`),
      where('__name__', '==', 'alice'),
    )));
    await assertFails(getDocs(collectionGroup(alice, 'privatePlayers')));
    await assertFails(getDocs(collection(alice, `${roomPath()}/results`)));
  });

  test('even the host cannot read server state containing pending claims, guesses, and reports', async () => {
    for (const db of [alice, bob, outsider]) {
      await assertFails(getDoc(doc(db, `${roomPath()}/internal/state`)));
    }
    await assertFails(getDocs(collection(alice, `${roomPath()}/internal`)));
  });

  test('private submission, guess, rating, and report paths remain inaccessible to every client', async () => {
    for (const name of ['submissions', 'guesses', 'ratings', 'reports']) {
      await assertFails(getDoc(doc(alice, `${roomPath()}/${name}/alice`)));
      await assertFails(getDoc(doc(bob, `${roomPath()}/${name}/alice`)));
      await assertFails(getDocs(collection(alice, `${roomPath()}/${name}`)));
    }
  });

  test('the result screen exposes a personal result only to its owner', async () => {
    const base = roomPath(completedRoomId);
    const result = await assertSucceeds(getDoc(doc(alice, `${base}/results/alice`)));
    assert.equal(result.data().total, 70);
    await assertFails(getDoc(doc(alice, `${base}/results/bob`)));
    await assertFails(getDoc(doc(outsider, `${base}/results/alice`)));
  });

  test('a role-switch reveal never makes another player\'s actual opinions readable', async () => {
    const base = roomPath(completedRoomId);
    const reveal = await assertSucceeds(getDoc(doc(alice, `${base}/publicRounds/reveal`)));
    assert.equal(reveal.data().items[0].switched, true);
    await assertFails(getDoc(doc(alice, `${base}/privatePlayers/bob`)));
    await assertFails(getDoc(doc(bob, `${base}/privatePlayers/alice`)));
    await assertFails(getDoc(doc(alice, `${base}/internal/state`)));
  });
});

describe('Only the authenticated backend can mutate game state', () => {
  test('host and participant cannot advance phases, select topics, change roles, or award points', async () => {
    await assertFails(updateDoc(doc(alice, roomPath()), { phase: 'results', phaseVersion: 999 }));
    await assertFails(updateDoc(doc(alice, roomPath()), { topicId: 'ai_assignment' }));
    await assertFails(updateDoc(doc(alice, `${roomPath()}/participants/alice`), {
      roleId: 'teacher_protection_student_advocate', ready: true,
    }));
    await assertFails(updateDoc(doc(alice, `${roomPath()}/privatePlayers/alice`), { switched: false }));
    await assertFails(updateDoc(doc(alice, `${roomPath()}/results/alice`), { total: 100 }));
    await assertFails(updateDoc(doc(bob, roomPath()), { hostUid: 'bob' }));
  });

  test('an outsider cannot forge membership or create a room directly', async () => {
    await assertFails(setDoc(doc(outsider, `${roomPath()}/participants/outsider`), {
      uid: 'outsider', nickname: 'Forged member', ready: true,
    }));
    await assertFails(getDoc(doc(outsider, roomPath())));
    await assertFails(setDoc(doc(outsider, 'rooms/forged-room'), {
      hostUid: 'outsider', phase: 'lobby',
    }));
  });

  test('a client cannot submit, publish, or overwrite server content through Firestore', async () => {
    for (const path of [
      `${roomPath()}/internal/state`,
      `${roomPath()}/submissions/alice`,
      `${roomPath()}/guesses/alice`,
      `${roomPath()}/ratings/alice`,
      `${roomPath()}/reports/alice`,
      `${roomPath()}/publicRounds/claim`,
      `${roomPath()}/privatePlayers/alice`,
      `${roomPath()}/results/alice`,
      'topics/teacher_protection',
      'roomCodes/hashed-code',
    ]) {
      await assertFails(setDoc(doc(alice, path), { forged: true }));
    }
  });

  test('a host cannot delete a room, another participant, or their own private history', async () => {
    await assertFails(deleteDoc(doc(alice, roomPath())));
    await assertFails(deleteDoc(doc(alice, `${roomPath()}/participants/bob`)));
    await assertFails(deleteDoc(doc(alice, `${roomPath()}/privatePlayers/alice`)));
    const room = await assertSucceeds(getDoc(doc(bob, roomPath())));
    assert.equal(room.data().phase, 'claim');
  });
});
