// 把 data/knowledge.json 嵌入 src/page.html，並讓 CDN 版本釘選與 package.json 一致。
//   node scripts/sync.mjs          寫入（npm run build 會自動先執行）
//   node scripts/sync.mjs --check  只檢查，不同步就以非零狀態結束（CI 用）
import { writeFileSync } from "node:fs";
import { PAGE_FILE, loadKB, loadPage, readJSON, PKG_FILE, validateKB, applyEmbed, applyPins } from "./lib/kb.mjs";

const check = process.argv.includes("--check");
const page = loadPage(), kb = loadKB(), pkg = readJSON(PKG_FILE);
const errs = validateKB(kb, page);
if (errs.length) { console.error("知識庫驗證失敗：\n- " + errs.join("\n- ")); process.exit(1); }
const next = applyPins(applyEmbed(page, kb), pkg);
if (next === page) { console.log("src/page.html 已與知識庫、版本釘選同步。"); process.exit(0); }
if (check) { console.error("src/page.html 與 data/knowledge.json 或 package.json 不同步，請執行 npm run sync 後再提交。"); process.exit(1); }
writeFileSync(PAGE_FILE, next);
console.log("已同步 src/page.html。");
