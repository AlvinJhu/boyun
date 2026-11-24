// 檢查頁面釘選的 CDN 套件（天文、農曆）是否有新版，有就改 package.json（頁面釘選由 sync 跟進）。
// 版本是否可用由後續的 npm test 把關：天文定點值與八字定點值若不符，整個更新流程就會失敗、不會開 PR。
import { readJSON, PKG_FILE, appendNotes } from "./lib/kb.mjs";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LIBS = ["astronomy-engine", "lunar-javascript"];
const semver = (v) => String(v).split(".").map((x) => parseInt(x, 10) || 0);
export const isNewer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
// 只升級到穩定版（x.y.z）；回傳 [{name, from, to}]
export function planUpdates(pkg, latest) {
  const out = [];
  for (const name of LIBS) {
    const from = pkg.devDependencies[name], to = latest[name];
    if (to && /^\d+\.\d+\.\d+$/.test(to) && isNewer(to, from)) out.push({ name, from, to });
  }
  return out;
}
export async function fetchLatest(fetchFn = fetch) {
  const out = {};
  for (const name of LIBS) {
    const r = await fetchFn(`https://registry.npmjs.org/${name}/latest`);
    if (!r.ok) throw new Error(`查詢 ${name} 失敗：HTTP ${r.status}`);
    out[name] = (await r.json()).version;
  }
  return out;
}
async function main() {
  const pkg = readJSON(PKG_FILE);
  const plan = planUpdates(pkg, await fetchLatest());
  if (!plan.length) { console.log("天文與農曆套件都已是最新版。"); return; }
  for (const u of plan) pkg.devDependencies[u.name] = u.to;
  writeFileSync(PKG_FILE, JSON.stringify(pkg, null, 2) + "\n");
  const lines = plan.map((u) => `- ${u.name}：${u.from} → ${u.to}`);
  console.log("已更新 package.json：\n" + lines.join("\n"));
  appendNotes("### 套件版本\n" + lines.join("\n") + "\n\n測試（天文定點值、八字定點值）通過才會產生此 PR。");
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch((e) => { console.error(e); process.exit(1); });
