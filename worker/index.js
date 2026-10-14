import { validateData, encodeText, decodeText, REPO, DATA_PATH } from '../site/core.js';
const BRANCH = 'main';
const encoder = new TextEncoder();
const TTL = 12 * 60 * 60;
const IMAGE_LIMIT = 1024 * 1024;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
function configuration(env) {
  if (!env.GITHUB_TOKEN) fail(503, '請管理者設定 GITHUB_TOKEN Secret。');
  if (!env.LIST_PASSWORD) fail(503, '請管理者設定 LIST_PASSWORD Secret。');
  if (env.LIST_PASSWORD.length < 12) fail(503, '清單密碼至少需要 12 個字元，請管理者重新設定 LIST_PASSWORD。');
  if (!env.ALLOWED_ORIGIN) fail(503, '請管理者設定網站來源 ALLOWED_ORIGIN。');
  if (!env.LOGIN_LIMITER || !env.API_LIMITER || !env.WRITE_LIMITER) fail(503, '請管理者使用專案的 wrangler.jsonc 重新部署，補齊流量限制設定。');
}
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sessionKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(`shoppinggggg-session-v1:${env.LIST_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function issueSession(env) {
  const payload = base64url(encoder.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + TTL, sid: crypto.randomUUID(), origin: env.ALLOWED_ORIGIN })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await sessionKey(env), encoder.encode(payload)));
  return `${payload}.${base64url(signature)}`;
}
async function authorize(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if (token.length > 1024 || !/^[\w-]+\.[\w-]+$/.test(token)) fail(401, '請先輸入清單密碼。');
  try {
    const [payload, signature] = token.split('.');
    const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify('HMAC', await sessionKey(env), decode(signature), encoder.encode(payload))) throw new Error();
    const value = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (!Number.isInteger(value.exp) || value.exp <= Date.now() / 1000 || value.origin !== env.ALLOWED_ORIGIN || typeof value.sid !== 'string') throw new Error();
    return value.sid;
  } catch { fail(401, '使用期限已過，請重新輸入清單密碼。'); }
}
async function passwordMatches(password, expected) {
  const [a, b] = await Promise.all([password, expected].map(p => crypto.subtle.digest('SHA-256', encoder.encode(p))));
  const x = new Uint8Array(a), y = new Uint8Array(b); let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
async function limitedBody(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) fail(413, '上傳內容太大，請縮小圖片後重試。');
  if (!request.body) fail(400, '缺少請求內容。');
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > limit) { await reader.cancel(); fail(413, '上傳內容太大，請縮小圖片後重試。'); } chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function jsonBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, '請求格式不正確。');
  try { return JSON.parse(new TextDecoder().decode(await limitedBody(request, 8192))); }
  catch (error) { if (error instanceof HttpError) throw error; fail(400, '請求格式不正確。'); }
}
async function rate(binding, key) { if (!(await binding.limit({ key })).success) fail(429, '操作太頻繁，請等待一分鐘後再試。'); }
async function github(env, path, method = 'GET', body, raw = false) {
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { method, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Shoppinggggg-Worker', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  } catch { fail(502, '儲存服務連線中斷，請重新讀取確認狀態。'); }
  if (!response.ok) {
    if ([409, 422].includes(response.status)) fail(409, '清單有新的變更，請重新讀取後再操作。');
    if (response.status === 429 || response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') fail(429, '儲存服務暫時達到使用上限，請稍後重試。');
    fail(502, '無法存取儲存服務，請聯絡管理者檢查 GitHub 權杖與權限。');
  }
  return raw ? response : response.json();
}
async function snapshot(env) {
  const ref = await github(env, `git/ref/heads/${BRANCH}`);
  const sha = ref.object.sha;
  const file = await github(env, `contents/${DATA_PATH}?ref=${sha}`);
  let data;
  try { data = validateData(JSON.parse(decodeText(file.content))); }
  catch { fail(502, '清單檔案格式不正確，請聯絡管理者。'); }
  return { data, sha };
}
async function commit(env, current, data, image) {
  validateData(data);
  const parent = await github(env, `git/commits/${current.sha}`);
  const tree = [{ path: DATA_PATH, mode: '100644', type: 'blob', content: JSON.stringify(data, null, 2) + '\n' }];
  if (image) {
    let binary = ''; for (let i = 0; i < image.bytes.length; i += 8192) binary += String.fromCharCode(...image.bytes.subarray(i, i + 8192));
    const blob = await github(env, 'git/blobs', 'POST', { content: btoa(binary), encoding: 'base64' });
    tree.push({ path: `site/${image.path}`, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const nextTree = await github(env, 'git/trees', 'POST', { base_tree: parent.tree.sha, tree });
  const next = await github(env, 'git/commits', 'POST', { message: 'Update shared shopping list', tree: nextTree.sha, parents: [current.sha] });
  // One atomic fast-forward publishes both JSON and image. A concurrent commit rejects this update.
  await github(env, `git/refs/heads/${BRANCH}`, 'PATCH', { sha: next.sha, force: false });
  return { data, sha: next.sha };
}
function verifySha(sha, current) { if (sha !== current.sha) fail(409, '清單有新的變更，請重新讀取後再操作。'); }
async function readImage(file, id) {
  if (!(file instanceof File) || !file.size || file.size > IMAGE_LIMIT) fail(413, '圖片須為 1 MB 以下的 JPG、PNG 或 WebP。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let ext;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ext = 'jpg';
  else if ([137,80,78,71,13,10,26,10].every((x, i) => bytes[i] === x)) ext = 'png';
  else if (new TextDecoder().decode(bytes.subarray(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8,12)) === 'WEBP') ext = 'webp';
  const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  if (!ext || file.type !== types[ext]) fail(415, '圖片格式不正確，請重新選擇 JPG、PNG 或 WebP。');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = [...digest].map(n => n.toString(16).padStart(2, '0')).join('');
  return { path: `assets/${id}-${hash.slice(0,16)}.${ext}`, bytes };
}
async function createItem(request, env) {
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data')) fail(415, '請求格式不正確。');
  let form, input;
  try { form = await new Response(await limitedBody(request, IMAGE_LIMIT + 16384), { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData(); input = JSON.parse(form.get('item')); }
  catch (error) { if (error instanceof HttpError) throw error; fail(400, '品項格式不正確。'); }
  if (!input || !/^[a-f0-9-]{36}$/.test(input.id) || typeof input.buyer !== 'string' || !input.buyer.trim() || input.buyer.length > 80 || typeof input.location !== 'string' || typeof input.name !== 'string' || input.location.length > 80 || input.name.length > 160) fail(400, '請填寫有效的購買人、購買地點與品名。');
  const item = { id: input.id, buyer: input.buyer.trim(), location: input.location.trim(), name: input.name.trim(), image: 'assets/placeholder.svg', priceJpy: input.priceJpy, quantity: input.quantity, purchased: false };
  try { validateData({ version: 1, items: [item] }); } catch { fail(400, '金額須為非負整數，數量至少 1，地點與品名不能空白。'); }
  const image = form.get('image') ? await readImage(form.get('image'), item.id) : undefined;
  if (image) item.image = image.path;
  const current = await snapshot(env);
  const existing = current.data.items.find(i => i.id === item.id);
  // Same form ID + content makes retries safe if a previous response was lost.
  if (existing) {
    if (['id','buyer','location','name','image','priceJpy','quantity'].every(key => existing[key] === item[key])) return current;
    fail(409, '這個品項已存在，請重新讀取清單確認。');
  }
  verifySha(form.get('sha'), current);
  if (current.data.items.length >= 500) fail(400, '清單最多 500 個品項，請聯絡管理者整理清單。');
  try { validateData({ ...current.data, items: [...current.data.items, item] }); } catch { fail(400, '金額超過可計算範圍。'); }
  return commit(env, current, { ...current.data, items: [...current.data.items, item] }, image);
}
async function handle(request, env) {
  const { pathname } = new URL(request.url);
  configuration(env);
  if (pathname === '/health' && request.method === 'GET') return Response.json({ ok: true });
  if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) fail(403, '此網站無法存取清單服務。');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (pathname === '/api/login' && request.method === 'POST') {
    await rate(env.LOGIN_LIMITER, request.headers.get('CF-Connecting-IP') || 'unknown');
    const input = await jsonBody(request);
    if (typeof input?.password !== 'string' || input.password.length > 256 || !await passwordMatches(input.password, env.LIST_PASSWORD)) fail(401, '清單密碼不正確，請重新輸入。');
    return Response.json({ session: await issueSession(env) });
  }
  const sid = await authorize(request, env);
  await rate(env.API_LIMITER, sid);
  if (pathname === '/api/items' && request.method === 'GET') return Response.json(await snapshot(env));
  if (pathname === '/api/items' && request.method === 'POST') { await rate(env.WRITE_LIMITER, 'shared-list'); return Response.json(await createItem(request, env)); }
  const itemRoute = pathname.match(/^\/api\/items\/([a-zA-Z0-9_-]+)$/);
  if (itemRoute && request.method === 'DELETE') {
    await rate(env.WRITE_LIMITER, 'shared-list');
    const input = await jsonBody(request);
    const current = await snapshot(env);
    if (!current.data.items.some(i => i.id === itemRoute[1])) return Response.json(current);
    verifySha(input?.sha, current);
    return Response.json(await commit(env, current, { ...current.data, items: current.data.items.filter(i => i.id !== itemRoute[1]) }));
  }
  if (itemRoute && request.method === 'PATCH') {
    await rate(env.WRITE_LIMITER, 'shared-list');
    const input = await jsonBody(request); if (typeof input?.purchased !== 'boolean') fail(400, '購買狀態不正確。');
    const current = await snapshot(env), item = current.data.items.find(i => i.id === itemRoute[1]);
    if (!item) fail(404, '找不到這個品項，請重新讀取。');
    verifySha(input.sha, current);
    if (item.purchased === input.purchased) return Response.json(current);
    return Response.json(await commit(env, current, { ...current.data, items: current.data.items.map(i => i.id === item.id ? { ...i, purchased: input.purchased } : i) }));
  }
  const imageRoute = pathname.match(/^\/api\/assets\/([a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp))$/i);
  if (imageRoute && request.method === 'GET') {
    const filename = imageRoute[1]; const ext = filename.split('.').pop().toLowerCase();
    const response = await github(env, `contents/site/assets/${filename}?ref=${BRANCH}`, 'GET', undefined, true);
    return new Response(response.body, { headers: { 'Content-Type': { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp' }[ext] } });
  }
  fail(404, '找不到這個操作。');
}
export default {
  async fetch(request, env) {
    let response;
    try { response = await handle(request, env); }
    catch (error) { response = Response.json({ error: error instanceof HttpError ? error.message : '清單服務發生錯誤，請重新讀取後再試。' }, { status: error instanceof HttpError ? error.status : 500 }); }
    const headers = new Headers(response.headers);
    if (request.headers.get('Origin') === env.ALLOWED_ORIGIN) {
      headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
    headers.set('Vary', 'Origin'); headers.set('Cache-Control', 'no-store'); headers.set('X-Content-Type-Options', 'nosniff');
    if (response.status === 429) headers.set('Retry-After', '60');
    return new Response(response.body, { status: response.status, headers });
  }
};
