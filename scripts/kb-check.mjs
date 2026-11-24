// 知識庫健康報告：驗證格式、列出缺漏。有格式錯誤才失敗；缺漏只是待成長的清單。
import { loadKB, loadPage, validateKB, missingKeys, expectedKeys } from "./lib/kb.mjs";
const page = loadPage(), kb = loadKB();
const errs = validateKB(kb, page), miss = missingKeys(kb, page), exp = expectedKeys(page);
for (const s of Object.keys(exp)) console.log(`${s}：已有 ${exp[s].length - miss[s].length}／${exp[s].length}，缺 ${miss[s].length}`);
if (errs.length) { console.error("\n格式錯誤：\n- " + errs.join("\n- ")); process.exit(1); }
console.log("格式檢查通過。");
