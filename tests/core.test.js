import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiStore, validateData, encodeText, decodeText, buyerName, itemsForBuyer, buyerSummary, noteLength } from '../site/core.js';
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

test('buyer totals include all of that buyer’s places and purchase states', () => {
  const items = [{ ...item, id: 'a', buyer: 'Doris', location: '東京', quantity: 2 }, { ...item, id: 'b', buyer: 'Doris', location: '大阪', priceJpy: 500, quantity: 1, purchased: true }, { ...item, id: 'c', buyer: 'Amy', priceJpy: 900, quantity: 3 }, { ...item, id: 'd', priceJpy: 100, quantity: 1 }];
  assert.deepEqual(buyerSummary(items, 'Doris'), { count: 2, purchased: 1, totalJpy: 2100 });
  assert.deepEqual(buyerSummary(items, 'Amy'), { count: 1, purchased: 0, totalJpy: 2700 });
  assert.deepEqual(buyerSummary(items, null), { count: 4, purchased: 1, totalJpy: 4900 });
  assert.deepEqual(buyerSummary(items, ''), { count: 1, purchased: 0, totalJpy: 100 });
  assert.deepEqual(buyerSummary([], null), { count: 0, purchased: 0, totalJpy: 0 });
  assert.equal(itemsForBuyer(items, 'Doris').length, 2);
});
test('legacy buyer values are unassigned and new buyer values are validated', () => {
  assert.equal(buyerName(item), '');
  assert.equal(buyerName({ ...item, buyer: ' Doris ' }), 'Doris');
  assert.equal(validateData(data), data);
  for (const buyer of [null, 123, [], 'x'.repeat(81)]) assert.throws(() => validateData({ version: 1, items: [{ ...item, buyer }] }));
});
test('notes accept legacy/empty values and count visible characters at the 20-character boundary', () => {
  for (const note of [undefined, '', '備'.repeat(20), '👨‍👩‍👧‍👦'.repeat(20), 'e\u0301'.repeat(20)]) {
    assert.doesNotThrow(() => validateData({version:1,items:[{...item,note}]}));
  }
  assert.equal(noteLength('中文🍓👨‍👩‍👧‍👦e\u0301'),5);
  for (const note of [null, 123, [], '備'.repeat(21), '🍓'.repeat(21)]) {
    assert.throws(() => validateData({version:1,items:[{...item,note}]}),/20/);
  }
});
