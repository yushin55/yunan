import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../frontend/scripts/check-firebase-auth.mjs', import.meta.url));

function check(origin, domains, providerError) {
  const mock = `globalThis.fetch = async (url) => {
    if (url.includes('/v1/projects?')) return Response.json({authorizedDomains: ${JSON.stringify(domains)}});
    ${providerError
      ? `return Response.json({error: {message: ${JSON.stringify(providerError)}}}, {status: 400});`
      : "return Response.json({providerId: 'google.com', authUri: 'https://accounts.google.com/sensitive-session'});"}
  };`;
  return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(mock)}`, script, 'production', origin], {
    encoding: 'utf8',
    env: { ...process.env, VITE_FIREBASE_PROJECT_ID: 'test-project', VITE_FIREBASE_API_KEY: 'test-web-key', VITE_USE_FIREBASE_EMULATORS: 'false' },
  });
}

test('rejects an unlisted deployment even if the provider would return an auth URL', () => {
  const result = check('https://class.example.com/practice', ['localhost']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNAUTHORIZED_DOMAIN \(class\.example\.com\)/);
  assert.doesNotMatch(result.stdout, /successfully/);
});

test('localhost does not authorize the loopback IP', () => {
  const result = check('http://127.0.0.1:5173', ['localhost']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Add 127\.0\.0\.1/);
});

test('accepts an explicitly authorized IP regardless of port', () => {
  const result = check('http://127.0.0.1:5173', ['127.0.0.1']);
  assert.equal(result.status, 0, result.stderr);
});

test('matches parent domains and subdomains without accepting a suffix lookalike', () => {
  const accepted = check('https://CLASS.example.com', ['example.com']);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.doesNotMatch(accepted.stdout + accepted.stderr, /sensitive-session/);
  assert.equal(check('https://notexample.com', ['example.com']).status, 1);
  assert.equal(check('https://127.0.0.1.example.com', ['127.0.0.1']).status, 1);
});

test('still detects a disabled Google provider after domain validation', () => {
  const result = check('http://localhost:5173', ['localhost'], 'OPERATION_NOT_ALLOWED');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Enable Google/);
});

test('rejects non-HTTP origins', () => {
  assert.equal(check('file:///practice', ['localhost']).status, 1);
});
