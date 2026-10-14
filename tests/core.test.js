import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiStore, validateData, encodeText, decodeText } from '../site/core.js';
const item = { id: '1', name: '眼罩', location: '藥妝', image: 'assets/a.webp', priceJpy: 800, quantity: 2, purchased: false };
const data = { version: 1, items: [item] };
test('UTF-8 JSON round trip preserves Chinese and Japanese', () => assert.equal(decodeText(encodeText('東京・眼罩 🍓')), '東京・眼罩 🍓'));
test('rejects invalid currency, quantity, duplicate ids and unsafe asset paths', () => {
  for (const change of [{ priceJpy: -1 }, { quantity: 1.5 }, { purchased: 'true' }, { image: 'https://evil.test/x' }, { image: 'assets/../secret' }]) assert.throws(() => validateData({ version: 1, items: [{ ...item, ...change }] }));
  assert.throws(() => validateData({ version: 1, items: [item, item] }));
  assert.equal(validateData(data), data);
});
test('frontend sends session only to configured backend', async () => {
  const calls = [];
  const store = new ApiStore('https://shopping.example', async function (url, options) {
    assert.equal(this, globalThis);
    calls.push({ url, options });
    return Response.json(url.endsWith('/login') ? { session: 'signed-session' } : { data, sha: 'head' });
  });
  await store.login('test-password'); await store.toggle('1', true, 'head');
  assert.equal(calls[1].url, 'https://shopping.example/api/items/1');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer signed-session');
  assert.deepEqual(JSON.parse(calls[1].options.body), { purchased: true, sha: 'head' });
});
test('expired sessions clear authorization and invalid API URL is rejected', async () => {
  const store = new ApiStore('https://shopping.example', async () => Response.json({ error: '請重新解鎖' }, { status: 401 }));
  store.session = 'expired'; await assert.rejects(store.load(), /重新解鎖/); assert.equal(store.session, undefined);
  assert.throws(() => new ApiStore(''), /尚未設定/);
});
