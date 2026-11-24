# 維護說明（給你，也給之後在 Claude 專案對話裡接手的 Claude）

## 原則

1. **`src/page.html` 是唯一來源。** claude.ai 的測試頁只是它的複本；要改版時先讀 repo 裡的這份，改完再同步回測試頁，不要反過來用舊的測試頁覆蓋 repo。
2. 頁面介面與文案沒有被要求就不要動。AI 推理與資料庫是可以演進的部分。
3. 任何改動都要先跑 `npm test`；改過頁面後再跑一次 `python3 tests/e2e.py`（需要 Chrome 與 Playwright）。

## 常用指令

| 指令 | 做什麼 |
| --- | --- |
| `npm ci` | 安裝（含天文、農曆測試用套件） |
| `npm test` | 天文定點值、八字定點值、提示詞、稽核、知識庫、後端額度測試 |
| `npm run sync` | 把 `data/knowledge.json` 嵌入頁面，並讓 CDN 版本和 `package.json` 一致 |
| `npm run sync:check` | 只檢查是否同步（CI 用） |
| `npm run kb:check` | 知識庫格式與缺漏報告 |
| `npm run kb:draft -- --dry` | 預覽下一批要請 AI 草擬的條目與提示詞 |
| `npm run build` | 同步並產生 `public/index.html` |

## AI 推理邏輯（都在 `src/page.html` 的「AI 推理層」）

- **推理守則**（`AI_PROTOCOL`、`PAIR_PROTOCOL`）：盤點依據 → 分主次 → 交叉驗證 → 每段「結論、依據、小動作」→ 用語限制 → 出稿前自檢。單次解讀、深度報告、雙人合盤共用。
- **交叉線索**（`crossClues`）：程式先把八字流年（十神、日支與月支的沖合刑害）和星盤行運（強度 3/4 以上）對齊到事業、財運、感情、健康作息，標示「多系統呼應／分歧／部分呼應／僅單一系統」。AI 只有在標示呼應時，才能寫成不同系統互相印證。對應表（`CC_SS`、`CC_TG`）是傳統對應的啟發式，不是精算結果，調整時請連同 `tests/prompts.test.mjs` 一起看。
- **知識庫詮釋**：行運時間窗後面附上「行星 × 本命點」的詮釋；姓名學三才附上該組合的詮釋。沒有條目就不附，不影響運作。
- **輸出稽核**（`auditAI`）：AI 回覆顯示前一定會過一次——禁用字眼改寫成中性說法、清單以外的行運編號移除。網站版與 claude.ai 版共用，不額外呼叫 AI。
- **後端**（`api/reading.js`）：系統提示詞寫入同一套原則；`read`、`deep`、`pair` 各有獨立的每日額度。

## 知識庫怎麼自己成長

資料在 `data/knowledge.json`，規則空間由頁面的引擎決定：行運「行星 × 本命點」共 35 組（已全部有內容）、姓名學三才 125 組（目前 3 組，其餘待補）。

每週自動流程（`.github/workflows/data-update.yml`）：

1. 檢查 `astronomy-engine`、`lunar-javascript` 有沒有新版，有就改 `package.json`，頁面的 CDN 版本跟著變。
2. 若設定了 `ANTHROPIC_API_KEY`，`scripts/kb-draft.mjs` 每次最多草擬 10 條缺漏的條目；字數、禁用字眼、格式不合的會被退回，下次重寫。
3. 同步頁面、跑全部測試。**任何一項失敗就不開 PR**，GitHub 會寄失敗通知。
4. 有變動才開 PR，PR 說明列出套件版本與每一條新增的內容。**合併即視為審核通過並自動上線**；不同意的條目直接在 PR 裡改或刪掉。

一次性設定：

- GitHub 儲存庫 → Settings → Actions → General → 勾選「Allow GitHub Actions to create and approve pull requests」。
- 要啟用 AI 草擬：Settings → Secrets and variables → Actions → 新增 `ANTHROPIC_API_KEY`（這是 GitHub 的金鑰，和 Vercel 的是分開的）。沒設定時，只做套件檢查，不會失敗。

手動新增或修改條目：直接改 `data/knowledge.json`（`by` 填 `human`），執行 `npm run sync`，提交。

## 限制

- 知識庫的詮釋是傳統命理的象徵說法，沒有可驗證的預測效力；網站文案已標示僅供參考。
- 目前沒有任何「依使用者回饋自動改寫內容」的機制；成長只來自上面這條有人把關的流程。
