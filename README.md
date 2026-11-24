# 撥雲見日

結合八字、星盤、姓名學與手相的個人化命理參考網站。

## 檔案

- `src/page.html`：頁面本體（與 claude.ai 測試頁同一份內容）
- `build.mjs`：產生 `public/index.html`（`npm run build` 會先同步知識庫再建置）
- `api/reading.js`：AI 解讀後端（Vercel Serverless Function），需設定環境變數 `ANTHROPIC_API_KEY`
- `data/knowledge.json`：知識庫（行運詮釋、三才詮釋），網站的 AI 提示詞會引用
- `scripts/`：同步、驗證、AI 草擬、套件更新腳本
- `tests/`：測試（`npm test`）
- `.github/workflows/`：CI 與每週自動資料更新

部署：Vercel 匯入此儲存庫即可，`vercel.json` 已設定建置指令與輸出資料夾。

## 更新方式

在 Claude 專案對話中提出修改，Claude 會改這個資料夾的檔案；你用 GitHub Desktop 提交並推上 main，Vercel 會自動重新部署。維護細節見 [MAINTAIN.md](MAINTAIN.md)。

## 自動成長

每週一 03:17（台灣時間）自動檢查天文與農曆套件新版、（有設定金鑰時）讓 Claude 草擬知識庫新條目，測試全過才開 PR，合併即上線。設定方式見 [MAINTAIN.md](MAINTAIN.md)。
