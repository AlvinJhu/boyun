// Vercel Serverless Function：網站版 AI 解讀（手相照片＋命盤資料 → JSON）
// 需要在 Vercel 專案設定環境變數 ANTHROPIC_API_KEY。
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // 讀取 ANTHROPIC_API_KEY
const MAX_PROMPT_CHARS = 8000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const hits = new Map(); // 簡易限流：每個 IP 每 10 分鐘 5 次（單一執行個體內有效）

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

export default async function handler(req, res) {
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

  try {
    // 照片只存在於這次請求的記憶體中，不寫入任何儲存空間。
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") return res.status(422).json({ code: "refused" });
    if (response.stop_reason === "max_tokens") return res.status(502).json({ code: "truncated" });
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      return res.status(200).json(parseJson(text));
    } catch {
      return res.status(502).json({ code: "invalid_json" });
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ code: "rate_limited" });
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ code: "server_misconfigured" });
    if (error instanceof Anthropic.BadRequestError) return res.status(400).json({ code: "bad_request" });
    if (error instanceof Anthropic.APIError) return res.status(502).json({ code: "upstream_error" });
    return res.status(500).json({ code: "server_error" });
  }
}
