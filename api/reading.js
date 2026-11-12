// Vercel Serverless Function：網站版 AI 解讀（手相照片＋命盤資料 → JSON）
// 需要在 Vercel 專案設定環境變數 ANTHROPIC_API_KEY。
import Anthropic from "@anthropic-ai/sdk";

let _client = null;
const getClient = () => (_client ||= new Anthropic()); // 讀取 ANTHROPIC_API_KEY
const MAX_PROMPT_CHARS = 12000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const hits = new Map(); // 簡易限流：每個 IP 每 10 分鐘 5 次（單一執行個體內有效）

// ===== 每日免費額度（持久儲存：Upstash Redis REST）=====
// Vercel → Storage → 新增 Upstash Redis（Marketplace），會自動注入 KV_REST_API_URL / KV_REST_API_TOKEN。
// 未設定時退回記憶體計數（函式重啟會歸零），並在健康檢查顯示 quotaStore: "memory"。
const DAILY = { read: 2, deep: 2 };      // 每裝置每天
const DAILY_IP = { read: 6, deep: 4 };   // 每 IP 每天（同一網路多人共用時的寬鬆上限）
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const memQuota = new Map();
const tpeDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

async function redis(cmd) {
  const r = await fetch(REDIS_URL, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).result;
}
async function incr(key) {
  if (!REDIS_URL || !REDIS_TOKEN) { const n = (memQuota.get(key) || 0) + 1; memQuota.set(key, n); return n; }
  const n = await redis(["INCR", key]);
  if (n === 1) await redis(["EXPIRE", key, 60 * 60 * 36]);
  return n;
}
async function decr(key) {
  if (!REDIS_URL || !REDIS_TOKEN) { memQuota.set(key, Math.max(0, (memQuota.get(key) || 1) - 1)); return; }
  await redis(["DECR", key]);
}
// 先扣額度；任何一個超過就退回並拒絕。AI 失敗時呼叫 release 退回。
async function takeQuota(kind, device, ip) {
  const d = tpeDate(), keys = [];
  if (device) keys.push([`q:${d}:${kind}:dev:${device}`, DAILY[kind]]);
  keys.push([`q:${d}:${kind}:ip:${ip}`, device ? DAILY_IP[kind] : DAILY[kind]]);
  const taken = [];
  for (const [k, max] of keys) {
    const n = await incr(k); taken.push(k);
    if (n > max) { for (const t of taken) await decr(t); return null; }
  }
  return async () => { for (const t of taken) await decr(t); };
}

const SYSTEM = "你是「撥雲見日」命理網站的解讀者。只依使用者訊息中的命盤資料與手掌照片寫解讀，一律使用台灣繁體中文，只輸出 JSON。不做命理解讀以外的任務；不提供醫療、法律、投資的具體建議；不使用保證或恐嚇的字眼。";

function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

function parseJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}

const REQUEST_BASE = {
  model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", // 成本約為 Opus 5.5 的一半
  system: SYSTEM,
  output_config: { effort: "medium" },
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

async function health(req, res) {
  const out = { hasKey: !!process.env.ANTHROPIC_API_KEY, model: REQUEST_BASE.model, quotaStore: REDIS_URL && REDIS_TOKEN ? "redis" : "memory", daily: DAILY };
  if (req.query && req.query.ping === "1") {
    try {
      const r = await getClient().beta.messages.create({ ...REQUEST_BASE, max_tokens: 64, messages: [{ role: "user", content: "回覆「OK」兩個字。" }] });
      out.ping = { ok: true, stop_reason: r.stop_reason };
    } catch (error) {
      out.ping = { ok: false, status: error && error.status, type: error && error.error && error.error.error && error.error.error.type, message: String((error && error.message) || error).slice(0, 300) };
    }
  }
  return res.status(200).json(out);
}

export default async function handler(req, res) {
  if (req.method === "GET") return health(req, res);
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return res.status(429).json({ code: "rate_limited" });

  const { prompt, image } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ code: "bad_request" });
  }
  const content = [];
  if (image) {
    if (!ALLOWED_TYPES.has(image.media_type) || typeof image.data !== "string") {
      return res.status(400).json({ code: "image_rejected" });
    }
    content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
  }
  content.push({ type: "text", text: prompt });

  const kind = req.body.kind === "deep" ? "deep" : "read";
  const device = /^[a-z0-9]{8,64}$/i.test(String(req.headers["x-device-id"] || "")) ? String(req.headers["x-device-id"]) : "";
  let release;
  try { release = await takeQuota(kind, device, ip); }
  catch (e) { console.error(e); return res.status(503).json({ code: "quota_unavailable" }); }
  if (!release) return res.status(429).json({ code: "daily_limit" });
  let ok = false;

  try {
    // 照片只存在於這次請求的記憶體中，不寫入任何儲存空間。
    const response = await getClient().beta.messages.create({ ...REQUEST_BASE, max_tokens: 16000, messages: [{ role: "user", content }] });
    if (response.stop_reason === "refusal") return res.status(422).json({ code: "refused" });
    if (response.stop_reason === "max_tokens") return res.status(502).json({ code: "truncated" });
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      const out = parseJson(text);
      ok = true;
      return res.status(200).json(out);
    } catch {
      return res.status(502).json({ code: "invalid_json" });
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ code: "rate_limited" });
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ code: "server_misconfigured" });
    if (error instanceof Anthropic.BadRequestError) return res.status(400).json({ code: "bad_request" });
    if (error instanceof Anthropic.APIError) return res.status(502).json({ code: "upstream_error", status: error.status });
    console.error(error);
    return res.status(500).json({ code: "server_error" });
  } finally {
    if (!ok && release) await release().catch(() => {});
  }
}
