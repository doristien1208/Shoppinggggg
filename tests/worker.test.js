import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { encodeText } from '../site/core.js';
const origin = 'https://doristien1208.github.io';
const limiter = { limit: async () => ({ success: true }) };
const env = { GITHUB_TOKEN: 'server-only-test-token', LIST_PASSWORD: 'friends-test-password', ALLOWED_ORIGIN: origin, LOGIN_LIMITER: limiter, API_LIMITER: limiter, WRITE_LIMITER: limiter };
function request(path, { method = 'GET', body, session, from = origin } = {}) {
  const headers = { Origin: from, ...(session ? { Authorization: `Bearer ${session}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) };
  return new Request(`https://worker.example${path}`, { method, headers, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
}
async function login() {
  const response = await worker.fetch(request('/api/login', { method: 'POST', body: { password: env.LIST_PASSWORD } }), env);
  assert.equal(response.status, 200); return (await response.json()).session;
}
function gitMock() {
  let head = 'head1', data = { version: 1, items: [{ id: 'sample-1', location: '東京', name: '餅乾', image: 'assets/placeholder.svg', priceJpy: 500, quantity: 1, purchased: false }] }, tree, pending, reject = false;
  const calls = [];
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname.split('/Shoppinggggg/')[1]; const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method, body }); assert.equal(options.headers.Authorization, `Bearer ${env.GITHUB_TOKEN}`);
    let response;
    if (path === 'git/ref/heads/main') response = { object: { sha: head } };
    else if (path === 'contents/site/data/items.json') response = { content: encodeText(JSON.stringify(data)) };
    else if (path.startsWith('git/commits/') && options.method === 'GET') response = { tree: { sha: 'base-tree' } };
    else if (path === 'git/blobs') response = { sha: 'image-blob' };
    else if (path === 'git/trees') { tree = body.tree; response = { sha: 'new-tree' }; }
    else if (path === 'git/commits') { pending = JSON.parse(tree.find(t => t.path.endsWith('items.json')).content); response = { sha: 'head2' }; }
    else if (path === 'git/refs/heads/main') {
      assert.equal(body.force, false);
      if (reject) return Response.json({ message: 'conflict' }, { status: 422 });
      head = body.sha; data = pending; response = { object: { sha: head } };
    } else throw new Error(`unexpected request ${path}`);
    return Response.json(response);
  };
  return { fetcher, calls, data: () => data, conflict: () => { reject = true; } };
}
test('wrong password, missing session, forged session, blocked origin and limits never reach GitHub', async () => {
  const original = globalThis.fetch; let hits = 0; globalThis.fetch = async () => { hits++; throw new Error(); };
  try {
    for (const req of [request('/api/items'), request('/api/items', { session: 'forged.token' }), request('/api/login', { method:'POST', body:{password:'wrong'} })]) assert.equal((await worker.fetch(req, env)).status, 401);
    const blocked = await worker.fetch(request('/api/items', { from: 'https://evil.example' }), env); assert.equal(blocked.status,403); assert.equal(blocked.headers.get('Access-Control-Allow-Origin'),null);
    const limited = await worker.fetch(request('/api/login', {method:'POST',body:{password:env.LIST_PASSWORD}}), { ...env, LOGIN_LIMITER:{limit:async()=>({success:false})} }); assert.equal(limited.status,429);
    assert.equal(hits,0);
  } finally { globalThis.fetch = original; }
});
test('sessions expire and rotating list password invalidates sessions', async () => {
  const session = await login();
  assert.equal((await worker.fetch(request('/api/items',{session}),{...env,LIST_PASSWORD:'different-password'})).status,401);
  const now = Date.now; Date.now = () => now() + 13 * 60 * 60 * 1000;
  try { assert.equal((await worker.fetch(request('/api/items',{session}),env)).status,401); } finally { Date.now = now; }
});
test('preflight uses exact origin; missing secrets fail closed', async () => {
  const preflight=await worker.fetch(request('/api/items',{method:'OPTIONS'}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await worker.fetch(request('/health'),{...env,GITHUB_TOKEN:''})).status,503);
});
test('authorized checkoff atomically saves and stale clients cannot overwrite', async () => {
  const session=await login(), mock=gitMock(), original=globalThis.fetch;globalThis.fetch=mock.fetcher;
  try {
    const stale=await worker.fetch(request('/api/items/sample-1',{method:'PATCH',session,body:{purchased:true,sha:'old'}}),env);assert.equal(stale.status,409);assert.equal(mock.calls.some(c=>c.method!=='GET'),false);
    const response=await worker.fetch(request('/api/items/sample-1',{method:'PATCH',session,body:{purchased:true,sha:'head1'}}),env);assert.equal(response.status,200);assert.equal(mock.data().items[0].purchased,true);assert.equal((await response.json()).sha,'head2');
  }finally{globalThis.fetch=original;}
});
test('concurrent branch update rejects final publish and preserves old data', async () => {
  const session=await login(),mock=gitMock(),original=globalThis.fetch;mock.conflict();globalThis.fetch=mock.fetcher;
  try { const response=await worker.fetch(request('/api/items/sample-1',{method:'PATCH',session,body:{purchased:true,sha:'head1'}}),env);assert.equal(response.status,409);assert.equal(mock.data().items[0].purchased,false); }finally{globalThis.fetch=original;}
});
test('item + valid image share one commit; repeated create is idempotent', async () => {
  const session=await login(),mock=gitMock(),original=globalThis.fetch;globalThis.fetch=mock.fetcher;
  const id='a34f1474-64db-49c5-8121-5ffba2d6b1b4';
  const makeForm=()=>{const form=new FormData();form.set('sha','head1');form.set('item',JSON.stringify({id,location:'大阪',name:'眼罩',priceJpy:900,quantity:2}));form.set('image',new File([Uint8Array.from([137,80,78,71,13,10,26,10,0])],'a.png',{type:'image/png'}));return form;};
  try {
    const response=await worker.fetch(request('/api/items',{method:'POST',session,body:makeForm()}),env);assert.equal(response.status,200);assert.equal(mock.data().items.length,2);
    const tree=mock.calls.find(c=>c.path==='git/trees').body.tree;assert.equal(tree.length,2);assert.equal(tree[1].sha,'image-blob');assert.ok(tree[1].path.startsWith('site/assets/'));
    const savedCommits=mock.calls.filter(c=>c.path==='git/commits').length;
    const retry=await worker.fetch(request('/api/items',{method:'POST',session,body:makeForm()}),env);assert.equal(retry.status,200);assert.equal(mock.data().items.length,2);assert.equal(mock.calls.filter(c=>c.path==='git/commits').length,savedCommits);
    assert.ok(!JSON.stringify(await retry.json()).includes(env.GITHUB_TOKEN));
  }finally{globalThis.fetch=original;}
});
test('invalid uploads and traversal routes are rejected', async () => {
  const session=await login();const form=new FormData();form.set('sha','head1');form.set('item',JSON.stringify({id:crypto.randomUUID(),location:'大阪',name:'眼罩',priceJpy:1,quantity:1}));form.set('image',new File(['<svg></svg>'],'fake.png',{type:'image/png'}));
  assert.equal((await worker.fetch(request('/api/items',{method:'POST',session,body:form}),env)).status,415);
  assert.equal((await worker.fetch(request('/api/assets/%2e%2e%2fsecret.png',{session}),env)).status,404);
});
