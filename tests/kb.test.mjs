// 知識庫、同步、自動草擬、套件更新規劃。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadPage as loadPageT, makeCalc } from "./helpers.mjs";
import { loadKB, loadPage, readJSON, PKG_FILE, validateKB, validateEntry, missingKeys, expectedKeys, wxRel, sancaiFacts, applyEmbed, applyPins, renderEmbed, BANNED } from "../scripts/lib/kb.mjs";
import { draft, buildPrompt } from "../scripts/kb-draft.mjs";
import { planUpdates, isNewer } from "../scripts/update-libs.mjs";

const page = loadPage(), kb = loadKB(), pkg = readJSON(PKG_FILE);
const T = loadPageT({ surname: "陳", given: "怡君" });

test("知識庫格式正確，且涵蓋全部行運規則（35 組）", () => {
  assert.deepEqual(validateKB(kb, page), []);
  assert.deepEqual(missingKeys(kb, page).transit_pairs, []);
  assert.equal(expectedKeys(page).transit_pairs.length, 35);
});

test("引擎實際產生的每一個行運編號，都能在知識庫找到詮釋", () => {
  const seen = new Set();
  for (const [y, m, d, hour] of [[1996, 11, 24, 12], [1985, 3, 9, 6], [2001, 7, 30, -1], [1970, 1, 15, 3], [1959, 12, 2, 18]]) {
    const a = T.calcAstro({ y, m, d, hour, city: ["台北市", 25.03, 121.56] });
    for (const Y of [2025, 2026, 2027]) T.calcTransit(a, Y).windows.forEach((w) => seen.add(w.rule));
  }
  assert.ok(seen.size > 20);
  for (const r of seen) { const k = r.split("-"); assert.ok(kb.transit_pairs[`${k[1]}-${k[3]}`], `${r} 缺詮釋`); }
});

test("頁面內嵌的知識庫與 data/knowledge.json 同步，CDN 釘選與 package.json 一致", () => {
  assert.equal(applyPins(applyEmbed(page, kb), pkg), page, "src/page.html 不同步，請執行 npm run sync");
  assert.equal(applyEmbed(page, kb), applyEmbed(applyEmbed(page, kb), kb), "同步必須是冪等的");
  assert.ok(renderEmbed(kb).startsWith("/*KB:BEGIN*/const KB="));
});

test("三才：腳本的五行關係與頁面的 wxRel、評級邏輯一致", () => {
  for (const a of "木火土金水") for (const b of "木火土金水") assert.equal(wxRel(a, b), T.wxRel(a, b), `${a}${b}`);
  assert.deepEqual(sancaiFacts("木火土"), { T: "木", R: "火", D: "土", r1: "相生", r2: "相生", level: "吉" });
  assert.equal(sancaiFacts("木土水").level, "待加強");
});

test("知識庫條目驗證：禁用字眼、字數、行運編號、by、日期", () => {
  const ok = { text: "這是一段合乎規範的詮釋文字，描述方向與留意事項，並給出一個可自己執行的小建議。", by: "ai-draft", date: "2026-11-24" };
  const exp = expectedKeys(page);
  assert.deepEqual(validateEntry("transit_pairs", "SAT-SUN", ok, exp), []);
  assert.ok(validateEntry("transit_pairs", "SAT-SUN", { ...ok, text: "你一定會成功，這是注定的，請務必照做，並且保持積極的態度面對一切。" }, exp).length >= 2);
  assert.ok(validateEntry("transit_pairs", "SAT-SUN", { ...ok, text: "太短" }, exp).length === 1);
  assert.ok(validateEntry("transit_pairs", "SAT-SUN", { ...ok, text: ok.text + " T-SAT-CON-SUN" }, exp).length === 1);
  assert.ok(validateEntry("transit_pairs", "XXX-YYY", ok, exp).length === 1);
  assert.ok(validateEntry("transit_pairs", "SAT-SUN", { ...ok, by: "bot" }, exp).length === 1);
  assert.ok(validateEntry("transit_pairs", "SAT-SUN", { ...ok, date: "昨天" }, exp).length === 1);
  assert.ok(BANNED.length >= 8);
});

const fakeClient = (reply) => ({ messages: { create: async (req) => { fakeClient.calls.push(req); return { content: [{ type: "text", text: typeof reply === "function" ? reply(req) : reply }] }; } } });
fakeClient.calls = [];
const goodText = "三才各自相承，外在機會與基礎運能互相支撐，適合穩步累積；留意節奏過快時先休息，再做下一步決定。";

test("自動草擬：合格內容寫入、不合格退回、遵守 --max，且提示詞帶入事實與範例", async () => {
  fakeClient.calls = [];
  const copy = structuredClone(kb);
  const keys = missingKeys(copy, page).sancai.slice(0, 3);
  const reply = (req) => { const o = {}; for (const k of keys) o[k] = goodText; o[keys[2]] = "你一定會成功，這是注定的，請務必照做，並且保持積極的態度面對一切啊。"; return JSON.stringify(o); };
  const r = await draft({ client: fakeClient(reply), kb: copy, page, max: 3, date: "2026-12-01" });
  assert.equal(r.added.length, 2); assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].key, keys[2]);
  assert.equal(copy.sancai[keys[0]].by, "ai-draft"); assert.equal(copy.sancai[keys[0]].date, "2026-12-01");
  assert.equal(copy.sancai[keys[2]], undefined);
  assert.equal(fakeClient.calls.length, 1);
  const prompt = fakeClient.calls[0].messages[0].content;
  assert.match(prompt, /已審核的範例/); assert.match(prompt, new RegExp(keys[0] + ": 天格"));
  assert.deepEqual(validateKB(copy, page), []);
});

test("自動草擬：回覆不是 JSON 時全部退回，不寫入", async () => {
  const copy = structuredClone(kb), before = JSON.stringify(copy);
  const r = await draft({ client: fakeClient("抱歉，我無法完成"), kb: copy, page, max: 2 });
  assert.equal(r.added.length, 0); assert.equal(r.rejected.length, 2); assert.equal(JSON.stringify(copy), before);
});

test("自動草擬：行運組合的提示詞帶入行星主題與本命點領域", () => {
  const copy = structuredClone(kb); delete copy.transit_pairs["SAT-VEN"];
  const p = buildPrompt("transit_pairs", ["SAT-VEN"], copy, page);
  assert.match(p, /SAT-VEN: 行運土星（主題：責任與考驗）× 本命金星（領域：感情與金錢價值觀）/);
});

test("套件更新規劃：只升級到較新的穩定版", () => {
  const p = { devDependencies: { "astronomy-engine": "2.1.19", "lunar-javascript": "1.7.7" } };
  assert.deepEqual(planUpdates(p, { "astronomy-engine": "2.1.20", "lunar-javascript": "1.7.7" }), [{ name: "astronomy-engine", from: "2.1.19", to: "2.1.20" }]);
  assert.deepEqual(planUpdates(p, { "astronomy-engine": "2.1.19", "lunar-javascript": "1.7.6" }), []);
  assert.deepEqual(planUpdates(p, { "astronomy-engine": "3.0.0-beta.1", "lunar-javascript": "1.7.7" }), []);
  assert.ok(isNewer("2.10.0", "2.9.9") && !isNewer("2.1.19", "2.1.19"));
});

test("頁面載入的 CDN 版本與 package.json 的 devDependencies 一致", () => {
  const html = readFileSync(new URL("../src/page.html", import.meta.url), "utf8");
  for (const n of ["astronomy-engine", "lunar-javascript"]) assert.match(html, new RegExp(`npm/${n}@${pkg.devDependencies[n].replace(/\./g, "\\.")}/`));
});
