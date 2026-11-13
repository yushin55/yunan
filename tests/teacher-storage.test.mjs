import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const source = await readFile(new URL('../frontend/src/features/teacher/teacherStorage.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const store = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const local = {};
Object.defineProperties(local, {
  getItem: { value: key => local[key] ?? null },
  setItem: { value: (key, value) => { local[key] = value; } },
  removeItem: { value: key => { delete local[key]; } },
});
globalThis.localStorage = local;
const debate = { key: 'room-100', endedAt: 100, notes: {}, practice: false };

test('history, notes, evaluations and AI reports are isolated across account switches', () => {
  const writes = [];
  const stopA = store.activateTeacherStorage('account-A', (...args) => writes.push(args));
  store.saveDebate(debate);
  store.saveNotes(debate.key, { event: [{ id: 'a', text: 'A private note', uid: null, at: 1 }] });
  store.saveEdits(debate.key, { student: { record: 'A private evaluation' } });
  store.saveAiReports(debate.key, { source: 'local', at: 1, original: [], current: [] });
  const stopB = store.activateTeacherStorage('account-B', () => {});
  stopA(); // An old provider's cleanup must not reset the newer account.
  assert.equal(store.teacherStorageAccount(), 'account-B');
  assert.deepEqual(store.loadHistory(), []);
  assert.equal(store.loadDebate(debate.key), null);
  assert.deepEqual(store.loadNotes(debate.key), {});
  assert.deepEqual(store.loadEdits(debate.key), {});
  assert.equal(store.loadAiReports(debate.key), null);
  store.saveDebate({ ...debate, roomCode: 'B' });
  store.deleteDebate(debate.key);
  stopB();
  const stop = store.activateTeacherStorage('account-A', () => {});
  assert.equal(store.loadHistory().length, 1);
  assert.equal(store.loadNotes(debate.key).event[0].text, 'A private note');
  assert.equal(store.loadEdits(debate.key).student.record, 'A private evaluation');
  assert.equal(store.loadAiReports(debate.key).source, 'local');
  assert.equal(writes.length, 4);
  stop();
});

test('unowned legacy and guest practice records are never claimed by a teacher', () => {
  localStorage.setItem('bridge.debateHistory', JSON.stringify([debate]));
  store.saveDebate({ ...debate, key: 'guest-practice', practice: true });
  const stop = store.activateTeacherStorage('new-account', () => {});
  assert.deepEqual(store.loadHistory(), []);
  assert.equal(store.loadDebate('guest-practice'), null);
  stop();
});

test('cloud hydration restores notes and evaluations and removes deleted records', () => {
  const stop = store.activateTeacherStorage('cloud-account', () => {});
  store.replaceTeacherRecords([{ key: debate.key, debate, notes: { event: [{ id: 'n', text: 'synced', uid: null, at: 1 }] }, edits: { student: { record: 'synced report' } } }]);
  assert.equal(store.loadDebate(debate.key).notes.event[0].text, 'synced');
  assert.equal(store.loadEdits(debate.key).student.record, 'synced report');
  store.replaceTeacherRecords([]);
  assert.equal(store.loadDebate(debate.key), null);
  assert.deepEqual(store.loadNotes(debate.key), {});
  assert.deepEqual(store.loadEdits(debate.key), {});
  stop();
});

test('reactivating an account notifies mounted subscribers even when its cache is unchanged', async () => {
  const seed = store.activateTeacherStorage('reactivated-account', () => {});
  store.saveDebate(debate);
  seed();
  await Promise.resolve();
  let visible = [];
  const unsubscribe = store.subscribeTeacherStorage(() => { visible = store.loadHistory(); });
  const stop = store.activateTeacherStorage('reactivated-account', () => {});
  await Promise.resolve();
  assert.equal(visible[0].key, debate.key);
  unsubscribe();
  stop();
});
