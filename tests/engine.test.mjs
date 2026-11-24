// 星盤行運引擎與八字、姓名學的定點驗證：更新天文／農曆套件時，這些值不能變。
import test from "node:test";
import assert from "node:assert/strict";
import { loadPage, makeCalc } from "./helpers.mjs";

const T = loadPage({ surname: "陳", given: "怡君" });
const plain = (x) => JSON.parse(JSON.stringify(x)); // vm 內建立的陣列原型不同，比較前先轉成一般物件
const city = ["台北市", 25.03, 121.56];
const dayOf = (tr, i) => new Date(tr.t0 + i * 864e5).toISOString().slice(0, 10);
const near = (iso, exp, tol = 2) => Math.abs((Date.parse(iso) - Date.parse(exp)) / 864e5) <= tol;
const a0 = T.calcAstro({ y: 1996, m: 11, d: 24, hour: 12, city });
const seg = (tr, n) => tr.segs.find((s) => s.n === n).list;

test("外行星換座日對照已知天文事件（±2 天）", () => {
  const T25 = T.calcTransit(a0, 2025), T24 = T.calcTransit(a0, 2024);
  let s = seg(T25, "土星");
  assert.equal(T.SIGNS[s[1].sign], "牡羊"); assert.ok(near(dayOf(T25, s[1].from), "2025-05-25"));
  assert.equal(T.SIGNS[s[2].sign], "雙魚"); assert.ok(near(dayOf(T25, s[2].from), "2025-09-01"));
  s = seg(T25, "木星"); assert.equal(T.SIGNS[s[1].sign], "巨蟹"); assert.ok(near(dayOf(T25, s[1].from), "2025-06-10"));
  s = seg(T25, "天王星"); assert.equal(T.SIGNS[s[1].sign], "雙子"); assert.ok(near(dayOf(T25, s[1].from), "2025-07-07"));
  s = seg(T25, "海王星"); assert.equal(T.SIGNS[s[1].sign], "牡羊"); assert.ok(near(dayOf(T25, s[1].from), "2025-03-30"));
  s = seg(T24, "冥王星"); assert.equal(T.SIGNS[s[1].sign], "水瓶"); assert.ok(near(dayOf(T24, s[1].from), "2024-01-21"));
  assert.ok(near(dayOf(T24, s[3].from), "2024-11-19"));
});

test("時間窗：精確日的實際角距偏差 < 0.15°，且與所選年份重疊", () => {
  const names = ["木星", "土星", "天王星", "海王星", "冥王星"], tn = ["太陽", "月亮", "水星", "金星", "火星"];
  for (const [y, m, d, hour] of [[1996, 11, 24, 12], [1985, 3, 9, 6], [2001, 7, 30, 21]]) {
    const a = T.calcAstro({ y, m, d, hour, city }), tr = T.calcTransit(a, 2026), { lons } = T.trLons(2026);
    assert.ok(tr.windows.length > 0 && tr.windows.length <= 12);
    for (const w of tr.windows) {
      assert.ok(w.end >= tr.iY0 && w.start <= tr.iY1, `${w.rule} 與 2026 年重疊`);
      assert.ok(w.dots >= 1 && w.dots <= 4 && Number.isFinite(w.score));
      assert.match(w.rule, /^T-[A-Z]{3}-[A-Z]{3}-[A-Z]{3}$/);
      for (const i of w.exact) {
        const k = names.indexOf(w.t), L = lons[k][i];
        const tg = w.n === "上升" ? a.asc : w.self ? a.bodies[5 + k].lon : a.bodies[tn.indexOf(w.n)].lon;
        const deg = { 合相: 0, 六分相: 60, 四分相: 90, 三分相: 120, 對分相: 180 }[w.asp];
        const dev = Math.min(...[deg, -deg].map((o) => Math.abs((((L - tg - o) % 360) + 540) % 360 - 180)));
        assert.ok(dev < 0.15, `${w.rule} 偏差 ${dev}`);
      }
    }
  }
});

test("時辰不詳：時間窗不含月亮與上升，且標示 solar", () => {
  const a = T.calcAstro({ y: 1996, m: 11, d: 24, hour: -1, city }), tr = T.calcTransit(a, 2026);
  assert.equal(tr.solar, true);
  assert.ok(tr.windows.length > 0);
  assert.ok(!tr.windows.some((w) => w.n === "月亮" || w.n === "上升"));
  assert.equal(T.calcTransit(a0, 2026).solar, false);
});

test("八字定點：1996/11/24 12 時 → 丙子 己亥 乙丑 壬午，2026 流年傷官／食神", () => {
  const c = makeCalc(T);
  assert.deepEqual(plain(c.b.pillars.map((p) => p[0] + p[1])), ["年柱丙子", "月柱己亥", "日柱乙丑", "時柱壬午"]);
  assert.equal(c.b.dayMaster, "乙木");
  assert.equal(c.pishi.gz, "丙午"); assert.equal(c.pishi.ssG, "傷官"); assert.equal(c.pishi.ssZ, "食神");
});

test("姓名學定點：陳怡君 → 五格與三才", () => {
  const c = makeCalc(T);
  assert.equal(c.name.full, "陳怡君");
  assert.deepEqual(plain(c.name.grids.map((g) => g.k)), ["天格", "人格", "地格", "外格", "總格"]);
  assert.equal(c.name.grids[0].n, 17); // 陳 16 畫 + 1
  assert.match(c.name.sancai.combo, /^[木火土金水]{3}$/);
});

test("姓名學：查無字、複姓＋單名的處理", () => {
  const miss = loadPage({ surname: "陳", given: "😀" });
  const r = miss.calcName(miss.calcBazi({ y: 1996, m: 11, d: 24, hour: 12, gender: 0, city }));
  assert.match(r.err, /查不到/);
  const dbl = loadPage({ surname: "歐陽", given: "修" });
  const r2 = dbl.calcName(dbl.calcBazi({ y: 1996, m: 11, d: 24, hour: 12, gender: 0, city }));
  assert.equal(r2.full, "歐陽修"); assert.deepEqual(plain(r2.sur), ["歐", "陽"]);
});
