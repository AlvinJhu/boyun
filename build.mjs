// 把 src/page.html（與 claude.ai Artifact 同一份內容）包成完整網頁 public/index.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
let body = readFileSync(new URL("./src/page.html", import.meta.url), "utf8");
const title = (body.match(/<title>[\s\S]*?<\/title>/) || ["<title>撥雲見日</title>"])[0];
body = body.replace(title, "");
const head = `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${title}<meta name="description" content="撥雲見日：結合八字、星盤與手相的個人化命理參考。"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>`;
mkdirSync(new URL("./public/", import.meta.url), { recursive: true });
writeFileSync(new URL("./public/index.html", import.meta.url), head + body + "</body></html>");
console.log("built public/index.html");
