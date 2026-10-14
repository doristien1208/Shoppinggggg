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
function gitMock(initialItems) {
  let head = 'head1', data = { version: 1, items: initialItems || [{ id: 'sample-1', location: '東京', name: '餅乾', image: 'assets/placeholder.svg', priceJpy: 500, quantity: 1, purchased: false }] }, tree, pending, reject = false;
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
    for (const req of [request('/api/items'), request('/api/items/sample-1', { method:'DELETE', body:{sha:'head1'} }), request('/api/items', { session: 'forged.token' }), request('/api/login', { method:'POST', body:{password:'wrong'} })]) assert.equal((await worker.fetch(req, env)).status, 401);
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
  const preflight=await worker.fetch(request('/api/items',{method:'OPTIONS'}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);assert.ok(preflight.headers.get('Access-Control-Allow-Methods').includes('DELETE'));
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
  const makeForm=()=>{const form=new FormData();form.set('sha','head1');form.set('item',JSON.stringify({id,buyer:'  Doris  ',location:'大阪',name:'眼罩',priceJpy:900,quantity:2}));form.set('image',new File([Uint8Array.from([137,80,78,71,13,10,26,10,0])],'a.png',{type:'image/png'}));return form;};
  try {
    const response=await worker.fetch(request('/api/items',{method:'POST',session,body:makeForm()}),env);assert.equal(response.status,200);assert.equal(mock.data().items.length,2);assert.equal(mock.data().items[1].buyer,'Doris');
    const tree=mock.calls.find(c=>c.path==='git/trees').body.tree;assert.equal(tree.length,2);assert.equal(tree[1].sha,'image-blob');assert.ok(tree[1].path.startsWith('site/assets/'));
    const savedCommits=mock.calls.filter(c=>c.path==='git/commits').length;
    const retry=await worker.fetch(request('/api/items',{method:'POST',session,body:makeForm()}),env);assert.equal(retry.status,200);assert.equal(mock.data().items.length,2);assert.equal(mock.calls.filter(c=>c.path==='git/commits').length,savedCommits);
    assert.ok(!JSON.stringify(await retry.json()).includes(env.GITHUB_TOKEN));
  }finally{globalThis.fetch=original;}
});
test('invalid uploads and traversal routes are rejected', async () => {
  const session=await login();const form=new FormData();form.set('sha','head1');form.set('item',JSON.stringify({id:crypto.randomUUID(),buyer:'Doris',location:'大阪',name:'眼罩',priceJpy:1,quantity:1}));form.set('image',new File(['<svg></svg>'],'fake.png',{type:'image/png'}));
  assert.equal((await worker.fetch(request('/api/items',{method:'POST',session,body:form}),env)).status,415);
  assert.equal((await worker.fetch(request('/api/assets/%2e%2e%2fsecret.png',{session}),env)).status,404);
});

test('new items require a buyer before any GitHub request', async () => {
  const session=await login(); const original=globalThis.fetch; let hits=0;
  globalThis.fetch=async()=>{hits++;throw new Error();};
  try {
    for (const buyer of [undefined, '', '   ', 123, 'x'.repeat(81)]) {
      const form=new FormData();form.set('sha','head1');form.set('item',JSON.stringify({id:crypto.randomUUID(),buyer,location:'東京',name:'眼罩',priceJpy:100,quantity:1}));
      const response=await worker.fetch(request('/api/items',{method:'POST',session,body:form}),env);assert.equal(response.status,400);
    }
    assert.equal(hits,0);
  }finally{globalThis.fetch=original;}
});

test('delete removes only the chosen item, keeps peer data and is safe to retry', async () => {
  const first={id:'a',buyer:'Doris',location:'東京',name:'餅乾',image:'assets/shared.png',priceJpy:100,quantity:1,purchased:false};
  const second={...first,id:'b',buyer:'Amy',name:'眼罩'};
  const session=await login(),mock=gitMock([first,second]),original=globalThis.fetch;globalThis.fetch=mock.fetcher;
  try {
    const response=await worker.fetch(request('/api/items/a',{method:'DELETE',session,body:{sha:'head1'}}),env);assert.equal(response.status,200);
    assert.deepEqual(mock.data().items,[second]);
    const tree=mock.calls.find(c=>c.path==='git/trees').body.tree;assert.equal(tree.length,1);assert.equal(tree[0].path,'site/data/items.json');
    const commits=mock.calls.filter(c=>c.path==='git/commits').length;
    const retry=await worker.fetch(request('/api/items/a',{method:'DELETE',session,body:{sha:'head1'}}),env);assert.equal(retry.status,200);assert.deepEqual((await retry.json()).data.items,[second]);assert.equal(mock.calls.filter(c=>c.path==='git/commits').length,commits);
  }finally{globalThis.fetch=original;}
});
test('stale delete is rejected before writing', async () => {
  const session=await login(),mock=gitMock(),original=globalThis.fetch;globalThis.fetch=mock.fetcher;
  try {
    const response=await worker.fetch(request('/api/items/sample-1',{method:'DELETE',session,body:{sha:'old'}}),env);assert.equal(response.status,409);assert.equal(mock.data().items.length,1);assert.equal(mock.calls.some(c=>c.method!=='GET'),false);
  }finally{globalThis.fetch=original;}
});
test('concurrent delete failure preserves the original item', async () => {
  const session=await login(),mock=gitMock(),original=globalThis.fetch;mock.conflict();globalThis.fetch=mock.fetcher;
  try {
    const response=await worker.fetch(request('/api/items/sample-1',{method:'DELETE',session,body:{sha:'head1'}}),env);assert.equal(response.status,409);assert.equal(mock.data().items.length,1);
  }finally{globalThis.fetch=original;}
});
test('notes persist, participate in safe retry and survive checkoff', async () => {
  const session=await login(),mock=gitMock(),original=globalThis.fetch;globalThis.fetch=mock.fetcher;
  const id=crypto.randomUUID();
  const makeForm=note=>{const form=new FormData();form.set('sha','head1');form.set('item',JSON.stringify({id,buyer:'Doris',location:'東京',name:'眼罩',note,priceJpy:100,quantity:1}));return form;};
  try {
    const note='備'.repeat(19)+'🍓';
    const saved=await worker.fetch(request('/api/items',{method:'POST',session,body:makeForm(' '+note+' ')}),env);assert.equal(saved.status,200);assert.equal(mock.data().items[1].note,note);
    const commits=mock.calls.filter(c=>c.path==='git/commits').length;
    const retry=await worker.fetch(request('/api/items',{method:'POST',session,body:makeForm(note)}),env);assert.equal(retry.status,200);assert.equal(mock.calls.filter(c=>c.path==='git/commits').length,commits);
    const changed=await worker.fetch(request('/api/items',{method:'POST',session,body:makeForm('改買其他款')}),env);assert.equal(changed.status,409);assert.equal(mock.data().items[1].note,note);
    const checked=await worker.fetch(request('/api/items/'+id,{method:'PATCH',session,body:{sha:'head2',purchased:true}}),env);assert.equal(checked.status,200);assert.equal(mock.data().items[1].note,note);assert.equal(mock.data().items[1].purchased,true);
  }finally{globalThis.fetch=original;}
});
test('invalid or over-limit notes are rejected before reaching GitHub', async () => {
  const session=await login(),original=globalThis.fetch;let hits=0;globalThis.fetch=async()=>{hits++;throw new Error();};
  try {
    for(const note of [null,123,[],{},'備'.repeat(21),'👨‍👩‍👧‍👦'.repeat(21)]) {
      const form=new FormData();form.set('sha','head1');form.set('item',JSON.stringify({id:crypto.randomUUID(),buyer:'Doris',location:'東京',name:'眼罩',note,priceJpy:100,quantity:1}));
      const response=await worker.fetch(request('/api/items',{method:'POST',session,body:form}),env);assert.equal(response.status,400);assert.match((await response.json()).error,/20/);
    }
    assert.equal(hits,0);
  }finally{globalThis.fetch=original;}
});
test('creating without a note stays compatible with retries of a legacy record', async () => {
  const id=crypto.randomUUID(),item={id,buyer:'Doris',location:'東京',name:'眼罩',image:'assets/placeholder.svg',priceJpy:100,quantity:1,purchased:false};
  const session=await login(),mock=gitMock([item]),original=globalThis.fetch;globalThis.fetch=mock.fetcher;
  try {
    const form=new FormData();form.set('sha','old');form.set('item',JSON.stringify({...item,note:''}));
    const response=await worker.fetch(request('/api/items',{method:'POST',session,body:form}),env);assert.equal(response.status,200);assert.equal(mock.calls.some(c=>c.method!=='GET'),false);
  }finally{globalThis.fetch=original;}
});
