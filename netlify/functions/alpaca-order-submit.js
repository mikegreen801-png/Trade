const headers = {
  "access-control-allow-origin": "*",
  "content-type": "application/json",
  "cache-control": "no-store"
};

const ALPACA_KEY = process.env.ALPACA_API_KEY_ID || process.env.APCA_API_KEY_ID || "";
const ALPACA_SECRET = process.env.ALPACA_API_SECRET_KEY || process.env.APCA_API_SECRET_KEY || "";
const TRADING_BASE_URL = (process.env.ALPACA_TRADING_BASE_URL || "https://paper-api.alpaca.markets").replace(/\/+$/, "");
const SUBMIT_ENABLED = String(process.env.ENABLE_ALPACA_ORDER_SUBMIT || "false").toLowerCase() === "true";
const REQUIRED_CONFIRMATION = "I UNDERSTAND THIS PLACES A REAL ORDER";
const ALLOWED_TRADING_BASES = new Set([
  "https://paper-api.alpaca.markets",
  "https://api.alpaca.markets"
]);

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...headers, ...extraHeaders },
    body: JSON.stringify(body)
  };
}

async function submitOrder(order) {
  if (!ALLOWED_TRADING_BASES.has(TRADING_BASE_URL)) {
    const error = new Error("ALPACA_TRADING_BASE_URL must be https://paper-api.alpaca.markets or https://api.alpaca.markets");
    error.statusCode = 500;
    throw error;
  }
  if (!ALPACA_KEY || !ALPACA_SECRET) {
    const error = new Error("Alpaca trading keys are not configured");
    error.statusCode = 501;
    throw error;
  }
  const response = await fetch(`${TRADING_BASE_URL}/v2/orders`, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "APCA-API-KEY-ID": ALPACA_KEY,
      "APCA-API-SECRET-KEY": ALPACA_SECRET
    },
    body: JSON.stringify(order)
  });
  const requestId = response.headers.get("x-request-id") || null;
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(body.message || body.error || `Alpaca returned ${response.status}`);
    error.statusCode = response.status;
    error.requestId = requestId;
    error.body = body;
    throw error;
  }
  return { body, requestId };
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });

  try {
    const input = JSON.parse(event.body || "{}");
    if (!SUBMIT_ENABLED) {
      return json(423, {
        ok: false,
        locked: true,
        error: "Order submit is disabled. Set ENABLE_ALPACA_ORDER_SUBMIT=true only after auth, preview, audit logging, and final confirmation are ready."
      });
    }
    if (input.confirmation !== REQUIRED_CONFIRMATION) {
      return json(400, {
        ok: false,
        error: `Final confirmation must exactly equal: ${REQUIRED_CONFIRMATION}`
      });
    }
    if (!input.previewId) {
      return json(400, { ok: false, error: "Missing previewId from a fresh order preview." });
    }
    const { body, requestId } = await submitOrder(input.order || {});
    return json(200, {
      ok: true,
      requestId,
      endpoint: TRADING_BASE_URL,
      mode: TRADING_BASE_URL.includes("paper") ? "paper" : "live",
      order: body
    }, requestId ? { "x-alpaca-request-id": requestId } : {});
  } catch (error) {
    return json(error.statusCode || 502, {
      ok: false,
      error: error.message,
      requestId: error.requestId || null,
      detail: error.body || null
    }, error.requestId ? { "x-alpaca-request-id": error.requestId } : {});
  }
};
