// 知識庫自動成長：找出引擎規則空間中還沒有詮釋的條目，請 Claude 草擬，通過自動檢查後寫進 data/knowledge.json。
// 由排程工作流程呼叫；產生的內容會放在 PR 裡，合併才算審核通過。
//   node scripts/kb-draft.mjs [--max 10] [--dry]
// 需要環境變數 ANTHROPIC_API_KEY（GitHub Secrets）；沒設定時直接略過，不算失敗。
import Anthropic from "@anthropic-ai/sdk";
import { pathToFileURL } from "node:url";
import { loadKB, saveKB, loadPage, missingKeys, engineTables, sancaiFacts, validateEntry, expectedKeys, appendNotes } from "./lib/kb.mjs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const BATCH = 5;
const SYSTEM = "你是「撥雲見日」命理網站的知識庫編輯。你撰寫傳統命理的象徵詮釋，口吻白話、溫和、直接，一律使用台灣繁體中文。只依使用者提供的事實撰寫，不補充任何未提供的天文、曆法或數字；不保證、不恐嚇；不提供醫療、法律、投資建議。只輸出 JSON。";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

function examples(kb, section, n = 3) {
  return Object.entries(kb[section] || {}).filter(([, v]) => v.text).slice(0, n).map(([k, v]) => `${k}: ${JSON.stringify(v.text)}`).join("\n");
}
export function buildPrompt(section, keys, kb, page) {
  const common = `撰寫規則：
- 每則 ${section === "sancai" ? "50–110" : "40–90"} 字，結尾要有一個可自己執行的方向或留意事項。
- 不用這些字眼：一定、必然、注定、改運、剋夫、剋妻、大凶、保證。
- 不要出現 T- 開頭的編號、括號註記或 markdown。
- 只輸出一個 JSON 物件，鍵必須與下列 KEY 完全相同，值是詮釋文字。`;
  if (section === "transit_pairs") {
    const { bodies, natal, theme, dom } = engineTables(page);
    const planet = Object.fromEntries(bodies.map((b) => [b[2], b[0]])), target = Object.fromEntries([...natal.map((n) => [n[1], n[0]]), ["ASC", "上升"]]);
    const lines = keys.map((k) => {
      const [p, t] = k.split("-"), pn = planet[p], tn = t === p ? `自己的本命${pn}` : (target[t] || t);
      const td = t === "ASC" ? "外在形象與新階段的開局" : t === p ? "" : dom[tn];
      return `${k}: 行運${pn}（主題：${theme[pn]}）× ${t === p ? tn + "（回歸、四分、對分）" : "本命" + tn + "（領域：" + td + "）"}`;
    });
    return `任務：為「行運行星 × 本命點」撰寫詮釋。只談這個組合的意義，不談具體相位（合、四分、對分、三分、六分由程式另行標示）。\n已審核的範例（請對齊口吻與長度）：\n${examples(kb, "transit_pairs")}\n${common}\n要寫的條目：\n${lines.join("\n")}`;
  }
  const lines = keys.map((k) => {
    const f = sancaiFacts(k);
    return `${k}: 天格${f.T}、人格${f.R}、地格${f.D}；天→人 ${f.r1}、人→地 ${f.r2}；整體評為「${f.level}」`;
  });
  return `任務：為姓名學「三才配置（天格・人格・地格的五行組合）」撰寫詮釋。天人關係看成功運與外在機會，人地關係看基礎運與根基。評級是程式依相生相剋算出的，請與評級一致：吉＝順承、中＝有拉扯但可調整、待加強＝張力較大但要寫成可以經營的方向，不要恐嚇。\n已審核的範例（請對齊口吻與長度）：\n${examples(kb, "sancai")}\n${common}\n要寫的條目：\n${lines.join("\n")}`;
}
function parseJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}
// client 可注入（測試用）；回傳 {added:[keys], rejected:[{key, reasons}]}
export async function draft({ client, kb, page, max = 10, model = MODEL, date = today() }) {
  const miss = missingKeys(kb, page), expected = expectedKeys(page), added = [], rejected = [];
  let budget = max;
  for (const section of ["transit_pairs", "sancai"]) {
    const todo = miss[section].slice(0, budget);
    for (let i = 0; i < todo.length; i += BATCH) {
      const keys = todo.slice(i, i + BATCH);
      const res = await client.messages.create({ model, max_tokens: 2000, system: SYSTEM, messages: [{ role: "user", content: buildPrompt(section, keys, kb, page) }] });
      let out;
      try { out = parseJson(res.content.filter((b) => b.type === "text").map((b) => b.text).join("")); } catch { keys.forEach((k) => rejected.push({ key: k, reasons: ["回覆不是合法 JSON"] })); continue; }
      for (const k of keys) {
        const entry = { text: typeof out[k] === "string" ? out[k].trim() : "", by: "ai-draft", date };
        const reasons = validateEntry(section, k, entry, expected);
        if (reasons.length) { rejected.push({ key: k, reasons }); continue; }
        (kb[section] ||= {})[k] = entry; added.push(`${section}.${k}`); budget--;
      }
    }
    if (budget <= 0) break;
  }
  return { added, rejected };
}
async function main() {
  const max = Number(process.argv[process.argv.indexOf("--max") + 1]) || 10, dry = process.argv.includes("--dry");
  const kb = loadKB(), page = loadPage(), miss = missingKeys(kb, page);
  const total = Object.values(miss).reduce((n, a) => n + a.length, 0);
  if (!total) { console.log("知識庫已涵蓋全部規則，沒有需要草擬的條目。"); return; }
  if (dry) { for (const s of Object.keys(miss)) if (miss[s].length) console.log(`--- ${s}（缺 ${miss[s].length}）\n` + buildPrompt(s, miss[s].slice(0, BATCH), kb, page)); return; }
  if (!process.env.ANTHROPIC_API_KEY) { console.log(`未設定 ANTHROPIC_API_KEY，略過草擬（目前缺 ${total} 條）。`); return; }
  const { added, rejected } = await draft({ client: new Anthropic(), kb, page, max });
  if (added.length) saveKB(kb);
  console.log(`新增 ${added.length} 條，退回 ${rejected.length} 條，尚缺 ${total - added.length} 條。`);
  if (rejected.length) console.log(rejected.map((r) => `退回 ${r.key}：${r.reasons.join("；")}`).join("\n"));
  if (added.length) appendNotes(`### 知識庫新增 ${added.length} 條（AI 草擬，合併即視為審核通過）\n${added.map((a) => { const [s, k] = a.split("."); return `- \`${a}\`：${kb[s][k].text}`; }).join("\n")}\n\n尚缺 ${total - added.length} 條，下週繼續。${rejected.length ? `\n\n自動檢查退回 ${rejected.length} 條（字數、禁用字眼或格式不符），下次會重寫。` : ""}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch((e) => { console.error(e); process.exit(1); });
