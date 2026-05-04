const headers = {
  "access-control-allow-origin": "*",
  "content-type": "application/json",
  "cache-control": "no-store"
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function cleanSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9./-]/g, "");
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function orderPayload(input) {
  const symbol = cleanSymbol(input.symbol);
  const qty = number(input.qty);
  const notional = number(input.notional);
  const side = String(input.side || "buy").toLowerCase() === "sell" ? "sell" : "buy";
  const type = ["market", "limit", "stop", "stop_limit"].includes(String(input.type || "").toLowerCase())
    ? String(input.type).toLowerCase()
    : "market";
  const timeInForce = String(input.time_in_force || input.timeInForce || "day").toLowerCase();
  const limitPrice = number(input.limit_price ?? input.limitPrice);
  const stopPrice = number(input.stop_price ?? input.stopPrice);
  const extendedHours = Boolean(input.extended_hours || input.extendedHours);

  const payload = {
    symbol,
    side,
    type,
    time_in_force: timeInForce,
    extended_hours: extendedHours
  };
  if (qty) payload.qty = String(qty);
  if (!qty && notional) payload.notional = String(notional);
  if (limitPrice) payload.limit_price = String(limitPrice);
  if (stopPrice) payload.stop_price = String(stopPrice);
  return payload;
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });

  try {
    const input = JSON.parse(event.body || "{}");
    const payload = orderPayload(input);
    const warnings = [];
    if (!payload.symbol) warnings.push("Missing symbol.");
    if (!payload.qty && !payload.notional) warnings.push("Provide quantity or notional.");
    if (payload.qty && payload.notional) warnings.push("Use quantity or notional, not both.");
    if (payload.type === "limit" && !payload.limit_price) warnings.push("Limit order needs limit_price.");
    if ((payload.type === "stop" || payload.type === "stop_limit") && !payload.stop_price) warnings.push("Stop order needs stop_price.");
    if (payload.extended_hours && payload.type !== "limit") warnings.push("Extended-hours orders usually require limit orders.");

    const previewId = `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return json(warnings.length ? 422 : 200, {
      ok: warnings.length === 0,
      previewId,
      liveSubmitLocked: true,
      order: payload,
      warnings,
      requiredConfirmation: "I UNDERSTAND THIS PLACES A REAL ORDER",
      note: "Preview only. Submit endpoint stays locked unless ENABLE_ALPACA_ORDER_SUBMIT=true is configured server-side."
    });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Invalid preview request" });
  }
};
