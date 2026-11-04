import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFirebaseConfig } from '../frontend/src/lib/firebaseConfig.ts';

test('emulator accepts missing web values, but rejects invalid mode', () => {
  assert.doesNotThrow(() => validateFirebaseConfig({}, true));
  assert.throws(() => validateFirebaseConfig({ VITE_USE_FIREBASE_EMULATORS: 'FALSE' }, true));
});

test('production frontend refuses emulator mode', () => {
  assert.throws(() => validateFirebaseConfig({ PROD: true, VITE_USE_FIREBASE_EMULATORS: 'true' }, true), /Production/);
});

test('real mode rejects missing/demo/template values without echoing values', () => {
  for (const value of [undefined, '', 'demo-key', '<apiKey>']) {
    assert.throws(() => validateFirebaseConfig({ VITE_FIREBASE_API_KEY: value }, false), /VITE_FIREBASE_API_KEY/);
  }
  const secret = '<private-test-marker>';
  assert.throws(() => validateFirebaseConfig({ VITE_FIREBASE_API_KEY: secret }, false), (error) => !error.message.includes(secret));
});

test('complete real-mode web configuration passes without network access', () => {
  assert.doesNotThrow(() => validateFirebaseConfig({
    VITE_FIREBASE_API_KEY: 'test-only',
    VITE_FIREBASE_AUTH_DOMAIN: 'test-only.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'test-only',
    VITE_FIREBASE_APP_ID: 'test-only',
    VITE_USE_FIREBASE_EMULATORS: 'false',
    VITE_API_BASE_URL: 'http://localhost:8000',
  }, false));
});

test('real mode rejects missing or malformed backend origins without echoing values', () => {
  const env = {
    VITE_FIREBASE_API_KEY: 'test-only', VITE_FIREBASE_AUTH_DOMAIN: 'test-only.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'test-only', VITE_FIREBASE_APP_ID: 'test-only',
  };
  for (const value of [undefined, '', '<backend-origin>', 'ftp://localhost', 'http://localhost:8000/api', 'http://localhost:8000/']) {
    assert.throws(() => validateFirebaseConfig({ ...env, VITE_API_BASE_URL: value }, false), /VITE_API_BASE_URL/);
  }
});
