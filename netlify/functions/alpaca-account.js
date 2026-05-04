const headers = {
  "access-control-allow-origin": "*",
  "content-type": "application/json",
  "cache-control": "no-store"
};

const ALPACA_KEY = process.env.ALPACA_API_KEY_ID || process.env.APCA_API_KEY_ID || "";
const ALPACA_SECRET = process.env.ALPACA_API_SECRET_KEY || process.env.APCA_API_SECRET_KEY || "";
const TRADING_BASE_URL = (process.env.ALPACA_TRADING_BASE_URL || "https://paper-api.alpaca.markets").replace(/\/+$/, "");
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

async function alpacaFetch(path, options = {}) {
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
  const response = await fetch(`${TRADING_BASE_URL}${path}`, {
    ...options,
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "APCA-API-KEY-ID": ALPACA_KEY,
      "APCA-API-SECRET-KEY": ALPACA_SECRET,
      ...(options.headers || {})
    }
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
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET" });

  try {
    const { body, requestId } = await alpacaFetch("/v2/account");
    return json(200, {
      ok: true,
      requestId,
      mode: TRADING_BASE_URL.includes("paper") ? "paper" : "live",
      endpoint: TRADING_BASE_URL,
      account: {
        id: body.id,
        accountNumber: body.account_number,
        status: body.status,
        currency: body.currency,
        cash: body.cash,
        buyingPower: body.buying_power,
        portfolioValue: body.portfolio_value,
        equity: body.equity,
        patternDayTrader: body.pattern_day_trader,
        tradingBlocked: body.trading_blocked,
        accountBlocked: body.account_blocked,
        transfersBlocked: body.transfers_blocked
      }
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
