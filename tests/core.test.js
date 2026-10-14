import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore, validateData, encodeText, decodeText } from '../site/core.js';
const item = { id: '1', name: '眼罩', location: '藥妝', image: 'assets/a.webp', priceJpy: 800, quantity: 2, purchased: false };
const data = { version: 1, items: [item] };
test('UTF-8 JSON round trip preserves Chinese and Japanese', () => assert.equal(decodeText(encodeText('東京・眼罩 🍓')), '東京・眼罩 🍓'));
test('rejects invalid currency, quantity, duplicate ids and unsafe asset paths', () => {
  for (const change of [{ priceJpy: -1 }, { quantity: 1.5 }, { purchased: 'true' }, { image: 'https://evil.test/x' }, { image: 'assets/../secret' }]) assert.throws(() => validateData({ version: 1, items: [{ ...item, ...change }] }));
  assert.throws(() => validateData({ version: 1, items: [item, item] }));
  assert.equal(validateData(data), data);
});
test('loads default branch and uses SHA optimistic lock for saving', async () => {
  const calls = [];
  const store = new GitHubStore('test-only', async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => calls.length === 1 ? { default_branch: 'main' } : calls.length === 2 ? { sha: 'old', content: encodeText(JSON.stringify(data)) } : { content: { sha: 'new' } } };
  });
  assert.equal((await store.load()).sha, 'old');
  assert.equal(await store.save(data, 'old'), 'new');
  const body = JSON.parse(calls[2].opts.body); assert.equal(body.sha, 'old'); assert.equal(body.branch, 'main'); assert.deepEqual(JSON.parse(decodeText(body.content)), data);
});
test('conflicting writes fail without retry or overwriting newer JSON', async () => {
  let calls = 0;
  const store = new GitHubStore('test-only', async () => { calls++; return { ok: false, status: 409 }; });
  await assert.rejects(store.save(data, 'old'), /版本已變更/); assert.equal(calls, 1);
});
test('authorization and network failures propagate', async () => {
  for (const status of [401, 403, 404]) await assert.rejects(new GitHubStore('test-only', async () => ({ ok: false, status })).load(), /權杖/);
  await assert.rejects(new GitHubStore('test-only', async () => { throw new Error('offline'); }).load(), /offline/);
});
