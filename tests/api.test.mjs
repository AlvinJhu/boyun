// 後端額度：雙人合盤（pair）要有自己的額度，不能占用「AI 解讀」額度。
import test from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY = "sk-test";
delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
let upstream = 0;
let override = null; // 個別測試可暫時改寫上游回應（SDK 建立時已抓住這個 fetch）
globalThis.fetch = async (...a) => {
  if (override) return override(...a);
  upstream++;
  return new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "m", content: [{ type: "text", text: "{\"ok\":1}" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
};
const { default: handler } = await import("../api/reading.js");
const call = async (kind, device = "device0001", ip = "1.2.3.4") => {
  let status = 0, body = null;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  await handler({ method: "POST", headers: { "x-forwarded-for": ip, "x-device-id": device }, body: { prompt: "測試", kind } }, res);
  return { status, body };
};

test("健康檢查列出三種額度", async () => {
  let body; await handler({ method: "GET", query: {} }, { status() { return this; }, json(b) { body = b; } });
  assert.deepEqual(body.daily, { read: 2, deep: 2, pair: 2 });
});

test("pair 用完 2 次後被擋，read 與 deep 額度不受影響", async () => {
  assert.equal((await call("pair")).status, 200);
  assert.equal((await call("pair")).status, 200);
  const third = await call("pair"); assert.equal(third.status, 429); assert.equal(third.body.code, "daily_limit");
  assert.equal((await call("read")).status, 200, "read 額度仍可用");
  assert.equal((await call("deep")).status, 200, "deep 額度仍可用");
  assert.ok(upstream >= 4);
});

test("未知的 kind 一律算 read", async () => {
  await call("read", "device0002", "5.6.7.8"); await call("bogus", "device0002", "5.6.7.8");
  const third = await call("read", "device0002", "5.6.7.8"); assert.equal(third.status, 429);
});

test("非 API 例外：回 server_error 並附錯誤摘要，方便排查", async () => {
  override = async () => new Response("<html>not json</html>", { status: 200, headers: { "content-type": "application/json" } });
  try {
    const r = await call("read", "device0099", "9.9.9.9");
    assert.equal(r.status, 500);
    assert.equal(r.body.code, "server_error");
    assert.match(r.body.detail, /^\w+: /);
    console.log("server_error case ->", JSON.stringify(r.body));
  } finally { override = null; }
});

test("逾時：回 timeout（504），不回 server_error", async () => {
  override = async () => { const e = new Error("The operation was aborted due to timeout"); e.name = "AbortError"; throw e; };
  try {
    const r = await call("read", "device0098", "9.9.9.8");
    assert.equal(r.status, 504);
    assert.equal(r.body.code, "timeout");
  } finally { override = null; }
});
