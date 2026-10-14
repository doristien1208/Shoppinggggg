import { ApiStore, validateData, buyerName, itemsForBuyer, buyerSummary, NOTE_LIMIT, noteLength } from './core.js?v=20261014-notes';
import { API_BASE_URL } from './config.js';
const $ = id => document.getElementById(id);
const yen = value => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
let data = { version: 1, items: [] }, sha, store, busy = false, preview, draftId, deleteTarget, messageTimer;
const urls = new Map();
const imageViewer = $('image-viewer');
const noteDialog = $('note-dialog');
function openNote(item) {
  $('note-message').textContent = item.note;
  noteDialog.showModal(); document.documentElement.classList.add('image-open');
}
function openImage(item) {
  const image = $('viewer-image');
  image.alt = item.name; image.dataset.path = item.image; image.hidden = true;
  $('viewer-status').textContent = '正在載入圖片…'; $('viewer-status').hidden = false;
  imageViewer.setAttribute('aria-label', `${item.name}的大圖`);
  imageViewer.showModal(); document.documentElement.classList.add('image-open');
  image.src = urls.get(item.image) || item.image;
}
$('viewer-image').addEventListener('load', () => {
  if (!imageViewer.open) return;
  $('viewer-image').hidden = false; $('viewer-status').hidden = true;
});
$('viewer-image').addEventListener('error', () => {
  if (!imageViewer.open) return;
  $('viewer-image').hidden = true; $('viewer-status').textContent = '圖片無法載入，請關閉後再試。'; $('viewer-status').hidden = false;
});
for (const dialog of [imageViewer, noteDialog]) {
  let backdropPressed = false;
  dialog.addEventListener('pointerdown', event => { backdropPressed = event.target === dialog; });
  dialog.addEventListener('pointercancel', () => { backdropPressed = false; });
  dialog.addEventListener('click', event => {
    if (backdropPressed && event.target === dialog) dialog.close();
    backdropPressed = false;
  });
  dialog.addEventListener('close', () => {
    backdropPressed = false;
    if (!imageViewer.open && !noteDialog.open) document.documentElement.classList.remove('image-open');
  });
}
imageViewer.addEventListener('close', () => {
  $('viewer-image').removeAttribute('src'); delete $('viewer-image').dataset.path;
});
function updateNoteCount() {
  const count = noteLength($('note').value.trim());
  $('note-counter').textContent = `${count} / ${NOTE_LIMIT} 字`;
  $('note-error').textContent = count > NOTE_LIMIT ? '備註最多 20 個字。' : '';
  $('note').setAttribute('aria-invalid', String(count > NOTE_LIMIT));
}
$('note').addEventListener('input', event => { if (!event.isComposing) updateNoteCount(); });
$('note').addEventListener('compositionend', updateNoteCount);
function syncConnection() {
  if (!store?.session) { try { sessionStorage.removeItem('shopping-session'); } catch {} }
  $('connect').textContent = store?.session ? '清單已解鎖' : '解鎖清單';
}
function restoreSession() {
  try { const session = sessionStorage.getItem('shopping-session'); if (session && API_BASE_URL) { store = new ApiStore(API_BASE_URL); store.session = session; } } catch {}
}
restoreSession();
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .8));
    if (!blob || blob.size > 1024 * 1024) throw new Error('圖片縮小後仍太大，請選擇其他圖片。');
    return new File([blob], 'photo.' + (blob.type === 'image/webp' ? 'webp' : 'png'), { type: blob.type });
  } finally { bitmap.close(); }
}
const params = new URLSearchParams(location.search);
let buyerFilter = params.has('buyer') ? params.get('buyer') : null;
let place = params.get('place') || '', filter = ['all', 'pending', 'done'].includes(params.get('filter')) ? params.get('filter') : 'all';
document.querySelector(`input[value="${filter}"]`).checked = true;
function message(text, error = false) {
  clearTimeout(messageTimer);
  $('notice').textContent = error ? '' : text; $('notice').hidden = error || !text;
  $('error').textContent = error ? text : ''; $('error').hidden = !error;
  if (text && !error && !text.startsWith('正在')) messageTimer = setTimeout(() => { $('notice').hidden = true; $('notice').textContent = ''; }, 4000);
}
function stateUrl() { const q = new URLSearchParams(); if (place) q.set('place', place); if (buyerFilter !== null) q.set('buyer', buyerFilter); if (filter !== 'all') q.set('filter', filter); history.replaceState(null, '', `${location.pathname}${q.size ? '?' + q : ''}`); }
function lock(value) { busy = value; $('retry').setAttribute('aria-busy', String(value)); document.querySelectorAll('button, input, select').forEach(el => { el.disabled = value; }); $('list').setAttribute('aria-busy', String(value)); }
function node(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
function render() {
  const buyers = [...new Set(data.items.map(buyerName))].sort((a, b) => a.localeCompare(b, 'zh-TW'));
  if (buyerFilter !== null && !buyers.includes(buyerFilter)) { buyerFilter = null; stateUrl(); }
  $('buyer-filter').replaceChildren();
  for (const buyer of [null, ...buyers]) {
    const option = node('option', buyer === null ? '全部購買人' : buyer || '未指定'); option.value = JSON.stringify(buyer); option.selected = buyerFilter === buyer; $('buyer-filter').append(option);
  }
  const selectedItems = itemsForBuyer(data.items, buyerFilter);
  const places = [...new Set(selectedItems.map(i => i.location))]; if (place && !places.includes(place)) { place = ''; stateUrl(); }
  const summary = buyerSummary(data.items, buyerFilter);
  $('progress').textContent = `${summary.purchased} / ${summary.count}`;
  $('total').textContent = yen(summary.totalJpy);
  $('total-label').textContent = buyerFilter === null ? '清單總額' : `${buyerFilter || '未指定'}的清單總額`;
  $('bar').style.width = `${summary.count ? summary.purchased / summary.count * 100 : 0}%`;
  $('tabs').replaceChildren();
  for (const location of ['', ...places]) {
    const button = node('button', location || '全部地點'); button.setAttribute('aria-pressed', String(place === location));
    button.addEventListener('click', () => { place = location; stateUrl(); render(); [...$('tabs').children].find(b => b.textContent === (location || '全部地點'))?.focus(); }); $('tabs').append(button);
  }
  const items = selectedItems.filter(i => (!place || i.location === place) && (filter === 'all' || i.purchased === (filter === 'done')));
  $('list-title').textContent = place || '全部地點'; $('count').textContent = `${items.length} 個品項`;
  $('list').replaceChildren();
  if (!items.length) $('list').append(node('li', data.items.length ? '這個分類沒有符合的品項。試試其他篩選。' : '清單還是空的，新增第一個想買的品項吧。', 'empty'));
  for (const item of items) {
    const row = node('li', undefined, `item${item.purchased ? ' done' : ''}${item.note?.trim() ? ' with-note' : ''}`);
    const image = node('img'); image.src = urls.get(item.image) || item.image; image.dataset.path = item.image; image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => { image.src = 'assets/placeholder.svg'; }, { once: true });
    const thumbnail = node('button', undefined, 'thumbnail'); thumbnail.type = 'button'; thumbnail.disabled = busy; thumbnail.setAttribute('aria-label', `查看大圖：${item.name}`); thumbnail.title = '查看大圖'; thumbnail.append(image); thumbnail.addEventListener('click', () => openImage(item));
    const info = node('div'); info.append(node('p', item.location), node('p', `購買人：${buyerName(item) || '未指定'}`, 'buyer-name'), node('h3', item.name), node('p', `${yen(item.priceJpy)} × ${item.quantity} 件`));
    info.append(node('p', yen(item.priceJpy * item.quantity), 'amount'));
    const topActions = node('div', undefined, 'item-actions-top');
    if (item.note?.trim()) {
      const noteButton = node('button', undefined, 'icon-button note-button'); noteButton.type = 'button'; noteButton.disabled = busy; noteButton.title = '查看備註'; noteButton.setAttribute('aria-label', `查看備註：${item.name}`);
      const icon = node('span', undefined, 'comment-icon'); icon.setAttribute('aria-hidden', 'true'); noteButton.append(icon); noteButton.addEventListener('click', () => openNote(item)); topActions.append(noteButton);
    }
    const label = node('label', undefined, 'check'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = item.purchased; checkbox.disabled = busy; checkbox.setAttribute('aria-label', `${item.name}，${item.purchased ? '已購買' : '未購買'}`);
    checkbox.addEventListener('change', async () => {
      if (!store?.session) { checkbox.checked = item.purchased; $('connection').showModal(); return; }
      const next = { ...data, items: data.items.map(i => i.id === item.id ? { ...i, purchased: checkbox.checked } : i) };
      lock(true); message('正在儲存購買狀態…');
      try { const result = await store.toggle(item.id, checkbox.checked, sha); sha = result.sha; data = validateData(result.data); message('購買狀態已儲存。'); }
      catch (error) { message(error.message || '儲存失敗，請重新讀取確認狀態。', true); }
      finally { lock(false); syncConnection(); render(); $('list').querySelector(`input[aria-label="${CSS.escape(item.name)}，${next.items.find(i => i.id === item.id).purchased ? '已購買' : '未購買'}"]`)?.focus(); }
    });
    const remove = node('button', undefined, 'icon-button delete-item'); remove.type = 'button'; remove.title = '刪除品項'; remove.setAttribute('aria-label', `刪除品項：${item.name}`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5'); svg.append(path); remove.append(svg);
    remove.addEventListener('click', () => {
      if (!store?.session) { $('connection').showModal(); return; }
      deleteTarget = item.id; $('delete-name').textContent = item.name; $('delete-error').textContent = ''; $('delete-dialog').showModal();
    });
    const actions = node('div', undefined, 'item-actions'); label.append(checkbox); topActions.append(label); actions.append(topActions, remove); row.append(thumbnail, info, actions); $('list').append(row);
  }
}
async function hydrateImages() {
  const activeStore = store;
  await Promise.allSettled([...new Set(data.items.map(i => i.image))].filter(path => path !== 'assets/placeholder.svg').map(async path => {
    try { const url = await activeStore.imageUrl(path); if (store !== activeStore) { URL.revokeObjectURL(url); return; } const old = urls.get(path); urls.set(path, url); for (const image of [...$('list').querySelectorAll('img'), $('viewer-image')]) if (image.dataset.path === path) image.src = url; if (old) URL.revokeObjectURL(old); }
    catch { /* Static deployed image remains a fallback. */ }
  }));
}
async function load() {
  lock(true); message('正在讀取清單…');
  try {
    if (store?.session) { const loaded = await store.load(); data = loaded.data; sha = loaded.sha; }
    else { const response = await fetch('data/items.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error('無法讀取清單，請稍後重試。'); data = validateData(await response.json()); }
    render(); message(''); if (store?.session) void hydrateImages();
  } catch (error) { message(error.message || '讀取失敗，請檢查網路後重試。', true); }
  finally { lock(false); syncConnection(); }
}
$('buyer-filter').addEventListener('change', event => { buyerFilter = JSON.parse(event.target.value); stateUrl(); render(); });
$('filters').addEventListener('change', event => { filter = event.target.value; stateUrl(); render(); });
$('connect').addEventListener('click', () => $('connection').showModal());
$('retry').addEventListener('click', load);
$('delete-confirm').addEventListener('click', async () => {
  if (!store?.session || busy || !deleteTarget) return;
  const id = deleteTarget; lock(true); $('delete-error').textContent = ''; message('正在刪除品項…');
  try {
    const result = await store.remove(id, sha); data = validateData(result.data); sha = result.sha;
    $('delete-dialog').close(); render(); message('品項已刪除。');
    for (const [path, url] of urls) if (!data.items.some(i => i.image === path)) { URL.revokeObjectURL(url); urls.delete(path); }
  } catch (error) { $('delete-error').textContent = error.message || '刪除失敗，請重新讀取後再試。'; message('刪除未完成。', true); }
  finally { lock(false); syncConnection(); if (!$('delete-dialog').open) $('retry').focus(); }
});
$('delete-dialog').addEventListener('close', () => { deleteTarget = undefined; });
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('connection-form').addEventListener('submit', async event => {
  event.preventDefault(); const password = $('password').value;
  if (!password) { $('connection-error').textContent = '請輸入清單密碼。'; $('password').setAttribute('aria-invalid', 'true'); $('password').focus(); return; }
  lock(true); $('connection-error').textContent = ''; $('password').removeAttribute('aria-invalid');
  try {
    const candidate = new ApiStore(API_BASE_URL); await candidate.login(password); const loaded = await candidate.load();
    store = candidate; data = validateData(loaded.data); sha = loaded.sha;
    try { sessionStorage.setItem('shopping-session', store.session); } catch {}
    $('password').value = ''; $('connection').close(); render(); message(''); void hydrateImages();
  } catch (error) { $('connection-error').textContent = error.message || '解鎖失敗，請檢查網路後重試。'; }
  finally { lock(false); syncConnection(); }
});
$('disconnect').addEventListener('click', () => { store = undefined; sha = undefined; $('password').value = ''; $('connection-error').textContent = ''; for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); syncConnection(); $('connection').close(); void load(); });
$('add').addEventListener('click', () => { if (!store?.session) { $('connection').showModal(); return; } draftId ||= crypto.randomUUID(); if (!$('buyer').value && buyerFilter) $('buyer').value = buyerFilter; $('item-error').textContent = ''; $('editor').showModal(); });
$('image').addEventListener('change', async () => {
  if (preview) URL.revokeObjectURL(preview); $('preview').hidden = true;
  const file = $('image').files[0]; if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) { $('item-error').textContent = '請選擇 10 MB 以下的 JPG、PNG 或 WebP 圖片。'; $('image').value = ''; return; }
  preview = URL.createObjectURL(file); $('preview').src = preview; $('preview').hidden = false;
});
$('item-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!store?.session || busy) return;
  const item = { id: draftId, buyer: $('buyer').value.trim(), location: $('location').value.trim(), name: $('name').value.trim(), note: $('note').value.trim(), image: 'assets/placeholder.svg', priceJpy: Number($('price').value), quantity: Number($('quantity').value), purchased: false };
  const fields = ['buyer', 'location', 'name', 'price', 'quantity']; fields.forEach(id => { $(id).removeAttribute('aria-invalid'); $(id).setAttribute('aria-describedby', 'item-error'); });
  const invalid = !item.buyer ? 'buyer' : !item.location ? 'location' : !item.name ? 'name' : !$('price').value || !Number.isSafeInteger(item.priceJpy) || item.priceJpy < 0 ? 'price' : !Number.isSafeInteger(item.quantity) || item.quantity < 1 ? 'quantity' : null;
  if (invalid) { $('item-error').textContent = '請填寫購買人、地點與品名；金額須為非負整數，數量至少 1。'; $(invalid).setAttribute('aria-invalid', 'true'); $(invalid).focus(); return; }
  updateNoteCount();
  if (noteLength(item.note) > NOTE_LIMIT) { $('note').focus(); return; }
  lock(true); $('item-error').textContent = ''; message('正在儲存品項…');
  try {
    validateData({ ...data, items: [...data.items.filter(i => i.id !== item.id), item] });
    const image = $('image').files[0] ? await prepareImage($('image').files[0]) : undefined;
    const result = await store.create(item, image, sha); sha = result.sha; data = validateData(result.data); draftId = undefined;
    $('editor').close(); $('item-form').reset(); updateNoteCount(); $('preview').hidden = true; if (preview) URL.revokeObjectURL(preview); buyerFilter = item.buyer; place = item.location; filter = 'all'; document.querySelector('input[value="all"]').checked = true; stateUrl(); render(); void hydrateImages(); message('品項已儲存。');
  } catch (error) { $('item-error').textContent = error.message || '儲存失敗，請重新讀取確認狀態。'; message('儲存未完成，輸入內容已保留。', true); }
  finally { lock(false); syncConnection(); }
});
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
window.addEventListener('beforeunload', event => { if (busy || ($('editor').open && ($('buyer').value || $('name').value || $('location').value || $('note').value))) { event.preventDefault(); event.returnValue = ''; } });
void load();
