# 一次性上線設定

這個版本使用 GitHub Pages 顯示網站、Cloudflare Worker 處理清單密碼與寫入，GitHub repo 保存 JSON 和 assets。朋友不需要 GitHub 帳號，所有人共用同一份清單。

## 1. 建立 Cloudflare 帳號
到 https://dash.cloudflare.com/ 註冊／登入，使用 Workers Free 方案即可。無需購買網域，Worker 會取得 workers.dev 網址。

## 2. 建立 GitHub 權杖
登入擁有 repo 的 doristien1208 帳號，前往：
https://github.com/settings/personal-access-tokens

選 Generate new token：
- Resource owner：doristien1208。
- Repository access：Only select repositories → Shoppinggggg。
- Repository permissions → Contents：Read and write。
- 設定到期日，例如 90 天；到期後必須更新 Cloudflare Secret。

複製權杖並只在步驟 4 的遮蔽輸入提示中貼入。不需要 Workflows 或 Administration 權限。不要貼到聊天、config.js、GitHub repo 或一般環境變數。

## 3. 從本機部署 Worker
在 Terminal 執行：
```sh
cd /Users/doris.tien/Documents/03_Highly_Confidentail/Shoppinggggg
npx wrangler login
npm run worker:deploy
```
`wrangler login` 會開啟瀏覽器；請登入你的 Cloudflare 帳號並完成授權。若從另一台電腦重新 clone，先執行 `npm ci`。

部署輸出會有：
```text
https://shoppinggggg-api.你的帳號子網域.workers.dev
```
記下此公開網址。此時尚未設定 Secret，API 回應「服務尚未設定完成」是預期行為。

## 4. 設定兩個 Secret
在同一個專案資料夾依序執行：
```sh
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put LIST_PASSWORD
```
第一個提示貼入步驟 2 的 GitHub 權杖；第二個提示輸入自己選的清單密碼（至少 12 個字元，建議 16 個以上）。提示會遮蔽輸入。這兩個值只保存於 Cloudflare 後端。

也可在 Cloudflare 控制台 → Workers & Pages → shoppinggggg-api → Settings → Variables and Secrets，新增上述兩個 **Secret** 並儲存／部署。勿選一般 Text 變數。

## 5. 連接網站
編輯 `site/config.js`，填入步驟 3 的 Worker 網址，沒有結尾斜線：
```js
export const API_BASE_URL = 'https://shoppinggggg-api.你的帳號子網域.workers.dev';
```
此網址可公開。你也可以只把 Worker 網址提供給 Codex，讓 Codex完成這一段設定；不要提供密碼或權杖。

推送更新：
```sh
git add site/config.js
git commit -m "Configure shopping API endpoint"
git push origin main
```
後端預設只接受 `https://doristien1208.github.io` 的網頁請求，已寫入 `wrangler.jsonc` 的 ALLOWED_ORIGIN。未來更換網站網域時，再更新這個來源並重新部署。來源只填協定與網域，不含 `/Shoppinggggg/`。

## 6. 啟用 GitHub Pages
到 https://github.com/doristien1208/Shoppinggggg/settings/pages ，Source 選 GitHub Actions。
到 Actions → Deploy shopping list → Run workflow（或重新執行失敗工作）。部署成功後開啟：
https://doristien1208.github.io/Shoppinggggg/

## 7. 驗證與分享
先開啟 `Worker 網址/health`，應顯示 `{"ok":true}`。這只確認後端配置，不會驗證 GitHub 權杖。
在網站按「解鎖清單」，輸入共用密碼。成功讀取清單才表示 GitHub 連線正常。
用兩個手機／分頁測試：第一個勾選一筆，第二個解鎖並按「重新讀取」，應看到相同狀態；再測試新增品項與圖片。
最後把**網站網址與清單密碼**分享給朋友即可，不分享 Worker 管理權限或 GitHub 權杖。

## 使用規則
- 共用密碼允許新增、勾選和確認刪除，所有朋友操作同一份 JSON。新增品項必填購買人；購買人篩選會同步更新上方總額與購買進度。
- 登入期限 12 小時，憑證保存在該分頁的 sessionStorage；重新整理可繼續使用，關閉分頁、登出或過期需重新解鎖。瀏覽器複製分頁可能沿用該分頁的登入。
- 變更會立即透過 API 保存；其他朋友按「重新讀取」同步，尚未做即時推播。
- 同時變更導致衝突時，會要求重新讀取，不會覆蓋他人資料。新增表單的重試有固定 ID，避免重複新增。
- 圖片原檔最多 10 MB，網站縮小為最長 1024px，再上傳 1 MB 以下 JPEG/PNG/WebP；照片需由瀏覽器成功解碼。
- JSON 和圖片在同一個 Git commit 發布，避免部分成功；每次儲存會新增 commit，並觸發 Pages 部署。已解鎖的頁面直接讀後端，不用等 Pages 部署。
- 登入每 IP 每分鐘最多 10 次；API 每登入分頁每分鐘最多 60 次；整份清單每分鐘最多 15 次寫入。Cloudflare 限流是分區近似計數，不是全球精準計數。
- 最多 500 個品項。這是朋友間的小清單，不是大量使用者的公開服務。
- 密碼只限制編輯；GitHub 公開 repo／Pages 的 JSON 和圖片仍可公開讀取。
- 更改 LIST_PASSWORD 會使既有登入憑證失效。登出清除目前分頁登入，不撤銷已複製的憑證；如要全部撤銷，請更改 LIST_PASSWORD。

## 常見問題
| 畫面訊息 | 處理方式 |
|---|---|
| 清單服務尚未設定 | 填入 site/config.js 的 Worker 網址並推送 |
| 清單服務尚未設定完成 | 檢查兩個 Secret、密碼長度及 Wrangler 限流綁定 |
| 無法連接清單服務 | 檢查網路、Worker 網址與 ALLOWED_ORIGIN |
| 無法存取儲存服務 | 檢查 GitHub 權杖是否過期、選到正確 repo 並有 Contents write |
| 清單有新的變更 | 關閉新增表單（草稿保留），重新讀取再操作 |
| 操作太頻繁 | 等待一分鐘後重試 |

## 官方文件
- Cloudflare 部署：https://developers.cloudflare.com/workers/get-started/guide/
- Cloudflare Secrets：https://developers.cloudflare.com/workers/configuration/secrets/
- GitHub Pages：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitHub API：https://docs.github.com/en/rest/git/refs

新版操作：分類標題右側的圓形箭頭圖示可重新讀取；品項右側垃圾桶可刪除，先確認品名再刪除。刪除只移除清單記錄，assets 保留以免影響共用圖片與復原。
