import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createMessageRequestId } from '../frontend/src/lib/messageRequest.ts';

test('secure-context request ids are independent and fit the backend schema', () => {
  const values = new Set(Array.from({ length: 100 }, () => createMessageRequestId(webcrypto)));
  assert.equal(values.size, 100);
  for (const value of values) assert.match(value, /^[A-Za-z0-9_-]{1,128}$/);
});
test('local HTTP fallback uses cryptographic random values', () => {
  const source = { getRandomValues: values => webcrypto.getRandomValues(values) };
  const values = new Set(Array.from({ length: 100 }, () => createMessageRequestId(source)));
  assert.equal(values.size, 100);
  for (const value of values) assert.match(value, /^[a-f0-9]{32}$/);
});
