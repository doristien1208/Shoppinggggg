import { GitHubStore, validateData } from './core.js';
const $ = id => document.getElementById(id);
const yen = value => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
let data = { version: 1, items: [] }, sha, store, busy = false, preview;
const urls = new Map();
const params = new URLSearchParams(location.search);
let place = params.get('place') || '', filter = ['all', 'pending', 'done'].includes(params.get('filter')) ? params.get('filter') : 'all';
document.querySelector(`input[value="${filter}"]`).checked = true;
function message(text, error = false) { $('notice').textContent = error ? '' : text; $('error').textContent = error ? text : ''; $('error').hidden = !error;  }
function stateUrl() { const q = new URLSearchParams(); if (place) q.set('place', place); if (filter !== 'all') q.set('filter', filter); history.replaceState(null, '', `${location.pathname}${q.size ? '?' + q : ''}`); }
function lock(value) { busy = value; document.querySelectorAll('button, input').forEach(el => { el.disabled = value; }); $('list').setAttribute('aria-busy', String(value)); }
function node(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
function render() {
  const places = [...new Set(data.items.map(i => i.location))]; if (place && !places.includes(place)) place = '';
  const done = data.items.filter(i => i.purchased).length;
  $('progress').textContent = `${done} / ${data.items.length}`;
  $('total').textContent = yen(data.items.reduce((sum, i) => sum + i.priceJpy * i.quantity, 0));
  $('bar').style.width = `${data.items.length ? done / data.items.length * 100 : 0}%`;
  $('tabs').replaceChildren();
  for (const location of ['', ...places]) {
    const button = node('button', location || '全部地點'); button.setAttribute('aria-pressed', String(place === location));
    button.addEventListener('click', () => { place = location; stateUrl(); render(); [...$('tabs').children].find(b => b.textContent === (location || '全部地點'))?.focus(); }); $('tabs').append(button);
  }
  const items = data.items.filter(i => (!place || i.location === place) && (filter === 'all' || i.purchased === (filter === 'done')));
  $('list-title').textContent = place || '全部地點'; $('count').textContent = `${items.length} 個品項`;
  $('list').replaceChildren();
  if (!items.length) $('list').append(node('li', data.items.length ? '這個分類沒有符合的品項。試試其他篩選。' : '清單還是空的，新增第一個想買的品項吧。', 'empty'));
  for (const item of items) {
    const row = node('li', undefined, `item${item.purchased ? ' done' : ''}`);
    const image = node('img'); image.src = urls.get(item.image) || item.image; image.alt = item.name; image.loading = 'lazy'; image.addEventListener('error', () => { image.src = 'assets/placeholder.svg'; }, { once: true });
    const info = node('div'); info.append(node('p', item.location), node('h3', item.name), node('p', `${yen(item.priceJpy)} × ${item.quantity} 件`), node('p', yen(item.priceJpy * item.quantity), 'amount'));
    const label = node('label', undefined, 'check'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = item.purchased; checkbox.disabled = busy; checkbox.setAttribute('aria-label', `${item.name}，${item.purchased ? '已購買' : '未購買'}`);
    checkbox.addEventListener('change', async () => {
      if (!store) { checkbox.checked = item.purchased; $('connection').showModal(); return; }
      const next = { ...data, items: data.items.map(i => i.id === item.id ? { ...i, purchased: checkbox.checked } : i) };
      lock(true); message('正在儲存購買狀態…');
      try { sha = await store.save(next, sha); data = next; message('購買狀態已儲存至 GitHub。'); }
      catch (error) { message(error.message || '儲存失敗，請重新讀取確認狀態。', true); }
      finally { lock(false); render(); $('list').querySelector(`input[aria-label="${CSS.escape(item.name)}，${next.items.find(i => i.id === item.id).purchased ? '已購買' : '未購買'}"]`)?.focus(); }
    });
    label.append(checkbox); row.append(image, info, label); $('list').append(row);
  }
}
async function hydrateImages() {
  const activeStore = store;
  await Promise.allSettled([...new Set(data.items.map(i => i.image))].filter(path => path !== 'assets/placeholder.svg').map(async path => {
    try { const url = await activeStore.imageUrl(path); if (store !== activeStore) { URL.revokeObjectURL(url); return; } const old = urls.get(path); if (old) URL.revokeObjectURL(old); urls.set(path, url); for (const image of $('list').querySelectorAll('img')) if (image.getAttribute('src') === path) image.src = url; }
    catch { /* Static deployed image remains a fallback. */ }
  }));
}
async function load() {
  lock(true); message('正在讀取清單…');
  try {
    if (store) { const loaded = await store.load(); data = loaded.data; sha = loaded.sha; }
    else { const response = await fetch('data/items.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error('無法讀取清單，請稍後重試。'); data = validateData(await response.json()); }
    render(); message(store ? '已連接 GitHub，變更會自動儲存。' : '連接 GitHub 後，即可勾選與新增品項。'); if (store) void hydrateImages();
  } catch (error) { message(error.message || '讀取失敗，請檢查網路後重試。', true); }
  finally { lock(false); }
}
$('filters').addEventListener('change', event => { filter = event.target.value; stateUrl(); render(); });
$('connect').addEventListener('click', () => $('connection').showModal());
$('retry').addEventListener('click', load);
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('connection-form').addEventListener('submit', async event => {
  event.preventDefault(); const token = $('token').value.trim(); if (!token) { $('connection-error').textContent = '請輸入存取權杖。'; $('token').focus(); return; }
  lock(true); $('connection-error').textContent = ''; const candidate = new GitHubStore(token);
  try { const loaded = await candidate.load(); store = candidate; data = loaded.data; sha = loaded.sha; $('token').value = ''; $('connection').close(); $('connect').textContent = 'GitHub 已連接'; render(); message('已連接 GitHub，變更會自動儲存。'); void hydrateImages(); }
  catch (error) { $('connection-error').textContent = error.message || '連接失敗，請檢查網路後重試。'; }
  finally { lock(false); }
});
$('disconnect').addEventListener('click', () => { store = undefined; sha = undefined; $('token').value = ''; $('connection-error').textContent = ''; for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); $('connection').close(); $('connect').textContent = '連接 GitHub'; void load(); });
$('add').addEventListener('click', () => { if (!store) { $('connection').showModal(); return; } $('item-error').textContent = ''; $('editor').showModal(); });
$('image').addEventListener('change', async () => {
  if (preview) URL.revokeObjectURL(preview); $('preview').hidden = true;
  const file = $('image').files[0]; if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) { $('item-error').textContent = '請選擇 5 MB 以下的 JPG、PNG 或 WebP 圖片。'; $('image').value = ''; return; }
  preview = URL.createObjectURL(file); $('preview').src = preview; $('preview').hidden = false;
});
$('item-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!store || busy) return;
  const item = { id: crypto.randomUUID(), location: $('location').value.trim(), name: $('name').value.trim(), image: 'assets/placeholder.svg', priceJpy: Number($('price').value), quantity: Number($('quantity').value), purchased: false };
  const fields = ['location', 'name', 'price', 'quantity']; fields.forEach(id => { $(id).removeAttribute('aria-invalid'); $(id).setAttribute('aria-describedby', 'item-error'); });
  const invalid = !item.location ? 'location' : !item.name ? 'name' : !$('price').value || !Number.isSafeInteger(item.priceJpy) || item.priceJpy < 0 ? 'price' : !Number.isSafeInteger(item.quantity) || item.quantity < 1 ? 'quantity' : null;
  if (invalid) { $('item-error').textContent = '請填寫地點與品名；金額須為非負整數，數量至少 1。'; $(invalid).setAttribute('aria-invalid', 'true'); $(invalid).focus(); return; }
  lock(true); $('item-error').textContent = ''; message('正在儲存品項…');
  try {
    validateData({ ...data, items: [...data.items, item] });
    // Reuse an uploaded asset on retry if JSON write failed.
    if ($('image').files[0]) { const file = $('image').files[0]; item.image = file.uploadedPath || await store.upload(file); file.uploadedPath = item.image; }
    const next = { ...data, items: [...data.items, item] }; sha = await store.save(next, sha); data = next;
    $('editor').close(); $('item-form').reset(); $('preview').hidden = true; if (preview) URL.revokeObjectURL(preview); place = item.location; filter = 'all'; document.querySelector('input[value="all"]').checked = true; stateUrl(); render(); void hydrateImages(); message('品項已儲存至 GitHub。');
  } catch (error) { $('item-error').textContent = error.message || '儲存失敗，請重新讀取確認狀態。'; message('儲存未完成，輸入內容已保留。', true); }
  finally { lock(false); }
});
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
window.addEventListener('beforeunload', event => { if (busy || ($('editor').open && ($('name').value || $('location').value))) { event.preventDefault(); event.returnValue = ''; } });
void load();
