# Shoppinggggg
手機優先的一頁式代購清單。原生 HTML/CSS/JavaScript，無建置依賴或資料庫。

## 本機預覽
```sh
npm run dev
```
開啟 http://localhost:5173 。`npm run check` 與 `npm test` 執行語法與資料／GitHub 寫入測試。

## 部署至 GitHub Pages
1. 將專案推送至 `doristien1208/Shoppinggggg` 的 `main`。
2. GitHub repo → Settings → Pages → Source 選 **GitHub Actions**。
3. Actions → Deploy shopping list → Run workflow（或 push main 自動觸發）。
4. 網址為 https://doristien1208.github.io/Shoppinggggg/ 。

## 手機使用
GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens：僅選 Shoppinggggg，Repository permissions 的 **Contents: Read and write**，設定到期日。在網站按「連接 GitHub」輸入權杖。不要把權杖貼進聊天、JSON 或程式碼。權杖只保留於目前分頁記憶體，關閉或重整後需重新連接。

勾選即寫入 JSON；新增品項可選圖片（JPEG/PNG/WebP，5 MB 上限），存到 `site/assets/`。按「重新讀取」取得其他手機最新狀態。衝突不覆蓋，請先重新讀取再操作。網路中斷後若不確定是否已寫入，也先重新讀取確認。JSON 寫入失敗可能留下一張尚未使用的圖片，可從 repo 手動清理。公開 repo 和 Pages 的清單與圖片可被其他人讀取。

初始有三筆「範例」資料，可直接編輯 `site/data/items.json` 更換或清空 `items`。

## JSON 結構
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
`priceJpy` 為日幣單價，非負整數；`quantity` 為至少 1 的整數；`id` 唯一。image 是相對網站根目錄的 assets 檔案路徑。新增 GitHub commit 後 Pages 部署需等待；已連接的頁面直接從 API 讀取最新 JSON／圖片，不必等待部署。

參考：[Pages 部署](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[Contents API](https://docs.github.com/en/rest/repos/contents)。
