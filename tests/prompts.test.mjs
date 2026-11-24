// AI 推理層：提示詞內容、交叉線索、輸出稽核。
import test from "node:test";
import assert from "node:assert/strict";
import { loadPage, makeCalc } from "./helpers.mjs";

const T = loadPage({ surname: "陳", given: "怡君" });
const MAX = 12000; // api/reading.js 的 MAX_PROMPT_CHARS
const ids = (s) => [...new Set(s.match(/T-[A-Z]{3}-[A-Z]{3}-[A-Z]{3}/g) || [])];

test("單次解讀與深度報告：含推理守則、交叉線索、行運編號與知識庫詮釋，且不超過長度上限", () => {
  for (const hour of [12, -1]) {
    const c = makeCalc(T, { hour });
    const single = T.buildPrompt(c, false, "none"), deep = T.buildReportPrompt(c);
    for (const p of [single, deep]) {
      assert.ok(p.length < MAX, `長度 ${p.length}`);
      assert.match(p, /推理流程（先在心中完成，再輸出 JSON）/);
      assert.match(p, /【交叉線索】/);
      assert.match(p, /｜詮釋：/);
      assert.match(p, /【姓名學】姓名「陳怡君」/);
      assert.ok(ids(p).length > 0);
    }
    if (hour < 0) assert.match(single, /已略過月亮與上升相關行運/);
  }
});

test("交叉線索只引用行運清單內的編號，且領域齊全", () => {
  const c = makeCalc(T), cc = T.crossClues(c), listed = new Set(c.tr.windows.map((w) => w.rule));
  for (const id of ids(cc)) assert.ok(listed.has(id), `${id} 不在行運清單`);
  for (const d of ["事業", "財運", "感情", "健康作息"]) assert.match(cc, new RegExp(`^${d}：`, "m"));
});

test("交叉線索判斷：單一系統、呼應、分歧、部分呼應、無線索", () => {
  assert.match(T.ccVerdict([]), /沒有明顯線索/);
  assert.match(T.ccVerdict([{ s: "八字", t: "壓" }]), /僅單一系統（八字）/);
  assert.match(T.ccVerdict([{ s: "八字", t: "壓" }, { s: "星盤", t: "壓" }]), /多系統呼應：壓力一致/);
  assert.match(T.ccVerdict([{ s: "八字", t: "助" }, { s: "星盤", t: "壓" }]), /分歧/);
  assert.match(T.ccVerdict([{ s: "八字", t: "變" }, { s: "星盤", t: "助" }]), /部分呼應/);
});

test("交叉線索：男命財星對應感情、女命官殺對應感情", () => {
  const c = makeCalc(T);
  const male = { ...c, f: { ...c.f, gender: 1 }, pishi: { ...c.pishi, ssG: "正財", ssZ: "比肩", rels: [] }, tr: { windows: [] } };
  assert.ok(T.crossItems(male)["感情"].some((x) => x.s === "八字" && x.x.includes("男命財星")));
  const female = { ...c, f: { ...c.f, gender: 0 }, pishi: { ...c.pishi, ssG: "正官", ssZ: "比肩", rels: [] }, tr: { windows: [] } };
  assert.ok(T.crossItems(female)["感情"].some((x) => x.s === "八字" && x.x.includes("女命官殺")));
});

test("輸出稽核：替換禁用字眼、移除清單外的行運編號、保留清單內編號", () => {
  const c = makeCalc(T), p = T.buildPrompt(c, false, "none"), good = ids(p)[0];
  const r = T.auditAI({ career: `你一定會成功，這是注定的，要改運。[${good}] 與 [T-SAT-TRI-VEN] 都很重要（T-MAR-CON-MOO）。`,
    western: { transit: "T-JUP-CON-SUN 不在清單", blend: ["剋夫之說不可信", "大凶", "血光之災"] }, palm: { quality_ok: true } }, p);
  assert.ok(!/一定會|注定|改運|剋夫|大凶|血光之災/.test(JSON.stringify(r)));
  assert.ok(r.career.includes(good));
  assert.ok(!r.career.includes("T-SAT-TRI-VEN") && !r.career.includes("T-MAR-CON-MOO"));
  assert.ok(!r.career.includes("（）") && !r.career.includes("[]"));
  assert.equal(r.palm.quality_ok, true);
  assert.equal(T.auditAI(null, p), null);
  assert.ok(T.auditAI.stat.ban === 0 && T.auditAI.stat.badId === 0);
});

test("雙人合盤提示詞：含合盤守則，不含行運編號規則", () => {
  const pairSrc = T.buildPairPrompt.toString();
  assert.match(pairSrc, /PAIR_PROTOCOL/);
  assert.equal(typeof T.auditAI({ x: "T-SAT-CON-SUN" }, "").x, "string");
  assert.equal(T.auditAI({ x: "T-SAT-CON-SUN" }, "").x, ""); // 合盤提示詞沒有行運，任何編號都是編造
});
