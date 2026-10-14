export const REPO = 'doristien1208/Shoppinggggg';
export const DATA_PATH = 'site/data/items.json';
export const NOTE_LIMIT = 20;
const noteSegmenter = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });
export const noteLength = value => [...noteSegmenter.segment(value)].length;
export function validateData(data) {
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('清單格式不正確，需要 version: 1 與 items 陣列。');
  const ids = new Set();
  for (const item of data.items) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.location !== 'string' || !item.location.trim() || typeof item.name !== 'string' || !item.name.trim() || !Number.isSafeInteger(item.priceJpy) || item.priceJpy < 0 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.priceJpy * item.quantity) || typeof item.purchased !== 'boolean' || typeof item.image !== 'string' || !/^assets\/[a-zA-Z0-9._-]+$/.test(item.image)) throw new Error('品項資料不正確：請檢查名稱、地點、整數金額、數量、圖片路徑與唯一 ID。');
    if (item.buyer !== undefined && (typeof item.buyer !== 'string' || item.buyer.length > 80)) throw new Error('購買人須為 80 個字元以內的名稱。');
    if (item.note !== undefined && (typeof item.note !== 'string' || noteLength(item.note) > NOTE_LIMIT)) throw new Error('備註最多 20 個字。');
    ids.add(item.id);
  }
  if (!Number.isSafeInteger(data.items.reduce((sum, i) => sum + i.priceJpy * i.quantity, 0))) throw new Error('清單總額超過可計算範圍。');
  return data;
}
export const buyerName = item => (item.buyer ?? '').trim();
export function itemsForBuyer(items, buyer) {
  return buyer === null ? items : items.filter(item => buyerName(item) === buyer);
}
export function buyerSummary(items, buyer) {
  const selected = itemsForBuyer(items, buyer);
  return { count: selected.length, purchased: selected.filter(i => i.purchased).length, totalJpy: selected.reduce((sum, i) => sum + i.priceJpy * i.quantity, 0) };
}
export function encodeText(value) {
  const bytes = new TextEncoder().encode(value);
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
}
export function decodeText(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
export class ApiStore {
  constructor(baseUrl, fetcher = fetch) {
    if (!baseUrl || !/^https:\/\//.test(baseUrl) && !/^http:\/\/localhost(?::\d+)?$/.test(baseUrl)) throw new Error('清單服務尚未設定，請聯絡清單管理者。');
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.fetcher = fetcher;
  }
  async request(path, options = {}) {
    let response;
    try { response = await this.fetcher.call(globalThis, `${this.baseUrl}/api${path}`, { ...options, headers: { ...(this.session ? { Authorization: `Bearer ${this.session}` } : {}), ...options.headers }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(60000) }); }
    catch { throw new Error('無法連接清單服務。請檢查網路，重新讀取後確認是否已儲存。'); }
    if (!response.ok) {
      if (response.status === 401) this.session = undefined;
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || '清單服務暫時無法使用，請稍後重試。');
    }
    return response;
  }
  async login(password) {
    const response = await this.request('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    this.session = (await response.json()).session;
  }
  async load() { return (await this.request('/items')).json(); }
  async toggle(id, purchased, sha) {
    return (await this.request(`/items/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchased, sha }) })).json();
  }
  async remove(id, sha) {
    return (await this.request(`/items/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha }) })).json();
  }
  async create(item, image, sha) {
    const form = new FormData(); form.set('item', JSON.stringify(item)); form.set('sha', sha);
    if (image) form.set('image', image);
    return (await this.request('/items', { method: 'POST', body: form })).json();
  }
  async imageUrl(path) {
    const response = await this.request(`/assets/${encodeURIComponent(path.slice(7))}`);
    return URL.createObjectURL(await response.blob());
  }
}
