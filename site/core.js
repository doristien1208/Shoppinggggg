export const REPO = 'doristien1208/Shoppinggggg';
export const DATA_PATH = 'site/data/items.json';
export function validateData(data) {
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('清單格式不正確，需要 version: 1 與 items 陣列。');
  const ids = new Set();
  for (const item of data.items) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.location !== 'string' || !item.location.trim() || typeof item.name !== 'string' || !item.name.trim() || !Number.isSafeInteger(item.priceJpy) || item.priceJpy < 0 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.priceJpy * item.quantity) || typeof item.purchased !== 'boolean' || typeof item.image !== 'string' || !/^assets\/[a-zA-Z0-9._-]+$/.test(item.image)) throw new Error('品項資料不正確：請檢查名稱、地點、整數金額、數量、圖片路徑與唯一 ID。');
    ids.add(item.id);
  }
  if (!Number.isSafeInteger(data.items.reduce((sum, i) => sum + i.priceJpy * i.quantity, 0))) throw new Error('清單總額超過可計算範圍。');
  return data;
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
export class GitHubStore {
  constructor(token, fetcher = fetch) { this.token = token; this.fetcher = fetcher; }
  async request(path, method = 'GET', body) {
    const response = await this.fetcher(`https://api.github.com/repos/${REPO}/${path}`, { method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      if ([409, 422].includes(response.status)) throw new Error('GitHub 版本已變更，請重新讀取清單後再操作。');
      if ([401, 403, 404].includes(response.status)) throw new Error('無法存取清單。請檢查權杖、repo 授權與 Contents 讀寫權限。');
      throw new Error(`GitHub 回應 ${response.status}，請稍後重新讀取。`);
    }
    return response.json();
  }
  async load() {
    const repo = await this.request('');
    this.branch = repo.default_branch;
    const file = await this.request(`contents/${DATA_PATH}?ref=${encodeURIComponent(this.branch)}`);
    return { data: validateData(JSON.parse(decodeText(file.content))), sha: file.sha };
  }
  async save(data, sha) {
    validateData(data);
    // The SHA is the optimistic lock: GitHub rejects stale writes.
    const result = await this.request(`contents/${DATA_PATH}`, 'PUT', { message: 'Update shopping list', content: encodeText(JSON.stringify(data, null, 2) + '\n'), sha, branch: this.branch });
    return result.content.sha;
  }
  async upload(file) {
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    if (!extensions[file.type] || file.size > 5 * 1024 * 1024 || !file.size) throw new Error('請選擇 5 MB 以下的 JPG、PNG 或 WebP 圖片。');
    const bitmap = await createImageBitmap(file); bitmap.close();
    const name = `${crypto.randomUUID()}.${extensions[file.type]}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    await this.request(`contents/site/assets/${name}`, 'PUT', { message: 'Add shopping item image', content: btoa(binary), branch: this.branch });
    return `assets/${name}`;
  }
  async imageUrl(path) {
    const file = await this.request(`contents/site/${path}?ref=${encodeURIComponent(this.branch)}`);
    const ext = path.split('.').pop().toLowerCase();
    const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
    if (!type) return 'assets/placeholder.svg';
    const blob = file.content ? file : await this.request(`git/blobs/${file.sha}`);
    const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, '')), c => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type }));
  }
}
