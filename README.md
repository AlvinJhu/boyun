# 撥雲見日

結合八字、星盤與手相的個人化命理參考網站。

- `src/page.html`：頁面本體（與 claude.ai 測試頁同一份）
- `build.mjs`：產生 `public/index.html`
- `api/reading.js`：AI 解讀後端（Vercel Serverless Function），需設定環境變數 `ANTHROPIC_API_KEY`

部署：Vercel 匯入此儲存庫即可，`vercel.json` 已設定建置指令與輸出資料夾。
