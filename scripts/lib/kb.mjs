// 知識庫共用函式：讀寫、規則空間、驗證、嵌入頁面、CDN 版本釘選。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = new URL("../../", import.meta.url);
const at = (rel) => fileURLToPath(new URL(rel, ROOT));
export const KB_FILE = at("data/knowledge.json");
export const PAGE_FILE = at("src/page.html");
export const PKG_FILE = at("package.json");

export const WX = ["木", "火", "土", "金", "水"];
export const BY = ["seed", "human", "ai-draft"];
// 與 src/page.html 的 AI_BAN 同步精神：知識庫內容不得出現這些字眼
export const BANNED = ["一定會", "必然會", "必定會", "注定", "改運", "剋夫", "剋妻", "血光之災", "災禍", "大凶", "保證", "百分之百"];
export const LIMITS = { transit_pairs: [20, 120], sancai: [30, 160] };

export const readJSON = (f) => JSON.parse(readFileSync(f, "utf8"));
export const loadKB = () => readJSON(KB_FILE);
export const saveKB = (kb) => writeFileSync(KB_FILE, JSON.stringify(kb, null, 2) + "\n");
export const loadPage = () => readFileSync(PAGE_FILE, "utf8");

// 從頁面程式取出引擎的表格（單一來源：頁面）
function evalConst(page, name) {
  const m = page.match(new RegExp(`const ${name}=(\\{.*\\}|\\[.*\\]);`));
  if (!m) throw new Error(`src/page.html 找不到 ${name}`);
  return new Function(`return (${m[1]})`)();
}
export function engineTables(page) {
  return { bodies: evalConst(page, "TR_BODIES"), natal: evalConst(page, "TR_NATAL"), theme: evalConst(page, "TR_THEME"), dom: evalConst(page, "TR_DOM") };
}

// 引擎可能產生的規則空間：行運行星 × 本命點（含上升與自身）；三才 5×5×5
export function expectedKeys(page) {
  const { bodies, natal } = engineTables(page);
  const targets = [...natal.map((n) => n[1]), "ASC"];
  const pairs = [];
  for (const b of bodies) { for (const t of targets) pairs.push(`${b[2]}-${t}`); pairs.push(`${b[2]}-${b[2]}`); }
  const sancai = [];
  for (const a of WX) for (const b of WX) for (const c of WX) sancai.push(a + b + c);
  return { transit_pairs: pairs, sancai };
}

// 五行關係（與頁面 wxRel 相同；tests 會比對兩者一致）
export function wxRel(a, b) {
  const i = WX.indexOf(a), j = WX.indexOf(b);
  if (i === j) return "比和";
  if ((i + 1) % 5 === j) return "相生";
  if ((j + 1) % 5 === i) return "逆生";
  if ((i + 2) % 5 === j) return "相剋";
  return "被剋";
}
export function sancaiFacts(combo) {
  const [T, R, D] = [...combo];
  const r1 = wxRel(T, R), r2 = wxRel(R, D);
  const bad = [r1, r2].filter((x) => x === "相剋" || x === "被剋").length;
  return { T, R, D, r1, r2, level: bad === 0 ? "吉" : bad === 1 ? "中" : "待加強" };
}

export function validateEntry(section, key, entry, expected) {
  const errs = [];
  const tag = `${section}.${key}`;
  if (expected && !expected[section].includes(key)) errs.push(`${tag}：不在引擎的規則空間內`);
  if (!entry || typeof entry.text !== "string") return [...errs, `${tag}：缺少 text`];
  const [lo, hi] = LIMITS[section] || [10, 200];
  const n = [...entry.text].length;
  if (n < lo || n > hi) errs.push(`${tag}：字數 ${n} 不在 ${lo}–${hi} 之間`);
  for (const w of BANNED) if (entry.text.includes(w)) errs.push(`${tag}：含禁用字眼「${w}」`);
  if (/T-[A-Z]{3}-[A-Z]{3}-[A-Z]{3}/.test(entry.text)) errs.push(`${tag}：不得內含行運編號`);
  if (/[{}<>`$]/.test(entry.text)) errs.push(`${tag}：含不允許的符號`);
  if (!BY.includes(entry.by)) errs.push(`${tag}：by 必須是 ${BY.join("/")}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || "")) errs.push(`${tag}：date 格式需為 YYYY-MM-DD`);
  return errs;
}
export function validateKB(kb, page) {
  const expected = expectedKeys(page), errs = [];
  for (const section of Object.keys(LIMITS)) {
    for (const [k, v] of Object.entries(kb[section] || {})) errs.push(...validateEntry(section, k, v, expected));
  }
  return errs;
}
export function missingKeys(kb, page) {
  const expected = expectedKeys(page), out = {};
  for (const s of Object.keys(LIMITS)) out[s] = expected[s].filter((k) => !(kb[s] && kb[s][k] && kb[s][k].text));
  return out;
}

// 嵌入頁面（只帶 text，縮小體積；"<" 轉義避免提早結束 script）
export function renderEmbed(kb) {
  const pick = (sec) => Object.fromEntries(Object.entries(kb[sec] || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, { text: v.text }]));
  const json = JSON.stringify({ transit_pairs: pick("transit_pairs"), sancai: pick("sancai") }).replace(/</g, "\\u003c");
  return `/*KB:BEGIN*/const KB=${json};/*KB:END*/`;
}
export function applyEmbed(page, kb) {
  const re = /\/\*KB:BEGIN\*\/[\s\S]*?\/\*KB:END\*\//;
  if (!re.test(page)) throw new Error("src/page.html 找不到 /*KB:BEGIN*/ … /*KB:END*/ 標記");
  return page.replace(re, () => renderEmbed(kb));
}
// CDN 版本釘選：以 package.json devDependencies 為準
export const PINS = [
  ["lunar-javascript", /(cdn\.jsdelivr\.net\/npm\/lunar-javascript@)[^/"]+(\/lunar\.js)/],
  ["astronomy-engine", /(cdn\.jsdelivr\.net\/npm\/astronomy-engine@)[^/"]+(\/astronomy\.browser\.min\.js)/],
];
export function applyPins(page, pkg) {
  let out = page;
  for (const [name, re] of PINS) {
    const v = pkg.devDependencies && pkg.devDependencies[name];
    if (!v) throw new Error(`package.json 缺少 devDependencies.${name}`);
    if (!re.test(out)) throw new Error(`src/page.html 找不到 ${name} 的 CDN 連結`);
    out = out.replace(re, (_, a, b) => `${a}${v}${b}`);
  }
  return out;
}
export function appendNotes(text) {
  const f = process.env.NOTES_FILE;
  if (f) writeFileSync(f, text.endsWith("\n") ? text : text + "\n", { flag: "a" });
}
