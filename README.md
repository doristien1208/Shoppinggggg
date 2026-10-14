# Shoppinggggg
手機優先的一頁式代購清單，使用地點頁籤與未購買／已購買／全部篩選。

網站在 GitHub Pages；Cloudflare Worker 驗證朋友共用密碼並寫入 GitHub。資料為 `site/data/items.json`，圖片在 `site/assets/`，無資料庫。GitHub 權杖只存在後端 Secret。

**[依照 SETUP.md 完成一次性部署設定](SETUP.md)**。朋友開啟網站並輸入清單密碼，即可新增品項、上傳圖片或勾選購買狀態。所有人共用同一份清單。

## 開發與驗證
```sh
npm ci
npm run dev
npm run check
npm test
npm run worker:check
```
網站預覽 http://localhost:5173 。後端本機使用 `npm run worker:dev`；在 gitignore 排除的 `.dev.vars` 設定 GITHUB_TOKEN、LIST_PASSWORD、ALLOWED_ORIGIN=http://localhost:5173。網站 config.js 設成本機 Worker URL。**本機 Worker 若使用正式權杖，操作會真的寫入 GitHub**；單元測試使用模擬 API。

## JSON
```json
{
  "version": 1,
  "items": [{
    "id": "unique-id",
    "location": "東京車站",
    "name": "奶油夾心餅乾",
    "image": "assets/photo.jpg",
    "priceJpy": 1200,
    "quantity": 2,
    "purchased": false
  }]
}
```
priceJpy 為日幣單價，數量至少 1；id 唯一。新增由網站產生 UUID。初始有三筆「範例」，可直接編輯 JSON 更換。

公開 repo 和 Pages 的清單與圖片可被讀取，密碼限制編輯。Session 期限 12 小時，不儲存原始密碼或 GitHub 權杖於瀏覽器。版本衝突需重新讀取；JSON 與圖片在同一個 commit 更新。適合小型朋友共用清單。
