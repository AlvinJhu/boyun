// 測試用：在 Node 內載入 src/page.html 的主程式（附假 DOM），取出內部函式做單元測試。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as Astronomy from "astronomy-engine";

const require = createRequire(import.meta.url);
const lunarLib = require("lunar-javascript");
export const PAGE_URL = new URL("../src/page.html", import.meta.url);
export const pageHtml = () => readFileSync(PAGE_URL, "utf8");

const NAMES = ["calcBazi", "calcAstro", "calcWestern", "calcTransit", "calcPishi", "calcName", "trSummary", "trFmt", "trLons",
  "buildPrompt", "buildReportPrompt", "buildPairPrompt", "calcPair", "crossClues", "crossItems", "ccVerdict", "auditAI", "kbText",
  "sancaiTx", "KB", "SIGNS", "signOf", "wxRel", "reportMonths", "KX", "tw", "readForm", "runLocal", "TOPICS", "QUOTA"];

function fakeDom(values) {
  const make = (id) => {
    const store = { value: values[id] ?? "", checked: false, hidden: false, textContent: "", innerHTML: "", files: [], style: {}, dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
    return new Proxy(store, {
      get(t, k) { if (k in t) return t[k]; if (k === "then") return undefined; return () => make(String(k)); },
      set(t, k, v) { t[k] = v; return true; },
    });
  };
  const cache = new Map();
  const el = (id) => { if (!cache.has(id)) cache.set(id, make(id)); return cache.get(id); };
  return {
    getElementById: el, querySelector: () => el("q"), querySelectorAll: () => [], createElement: () => make("new"),
    addEventListener() {}, body: make("body"), documentElement: make("html"),
  };
}

export function loadPage(values = {}) {
  const html = pageHtml();
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const main = scripts.join("\n;\n");
  const tail = main.lastIndexOf("})();");
  if (tail < 0) throw new Error("找不到主程式結尾");
  const expose = `globalThis.__T={};for(const n of ${JSON.stringify(NAMES)}){try{__T[n]=eval(n)}catch(e){}}\n`;
  const code = main.slice(0, tail) + expose + main.slice(tail);
  const store = new Map();
  const ctx = {
    Astronomy, ...lunarLib, document: fakeDom(values), console, setTimeout, clearTimeout, Date, Math, JSON, Intl,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    navigator: { userAgent: "node" }, location: { hash: "", href: "http://localhost/" }, fetch: async () => { throw new Error("no network"); },
    URL, Image: function () {}, FileReader: function () {}, requestAnimationFrame: (f) => f(),
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({}), alert() {}, open() {}, print() {}, history: { replaceState() {}, pushState() {} },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: "page-main-script.js" });
  return ctx.__T;
}

// 組一份和網站流程相同形狀的 c（f, b, a, w, tr, pishi, name）。姓名由 loadPage({surname, given}) 的假表單提供。
export function makeCalc(T, { y = 1996, m = 11, d = 24, hour = 12, gender = 0, Y = 2026 } = {}) {
  const city = ["台北市", 25.03, 121.56];
  const f = { y, m, d, hour, gender, city, q: "" };
  const b = T.calcBazi(f), a = T.calcAstro(f), w = T.calcWestern(a);
  const tr = T.calcTransit(a, Y), pishi = T.calcPishi(b, Y);
  const c = { f, b, a, w, tr, pishi };
  const nm = T.calcName(b);
  if (nm && !nm.err) c.name = nm;
  return c;
}
