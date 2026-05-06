/**
 * Polymarket API Proxy — /api/polymarket?action=...
 * Browse + pin: no auth needed (Gamma + CLOB public endpoints)
 * Order placement: requires Polymarket L2 credentials via BYOK headers
 */

const https = require("https");

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE  = "https://clob.polymarket.com";

const CATEGORY_TAG_MAP = {
  macro:    "economics",
  crypto:   "crypto",
  politics: "politics",
  earnings: "business",
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "DayTraderOS/1.0" } }, (res) => {
      let raw = "";
      res.on("data", d => { raw += d; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Non-JSON response from ${url}`)); }
      });
    }).on("error", reject);
  });
}

async function handleMarkets(req, res) {
  res.setHeader("Cache-Control", "public, max-age=30");
  const limit    = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const category = String(req.query.category || "").toLowerCase();
  const q        = String(req.query.q || "").trim();

  const params = new URLSearchParams({
    limit: String(limit),
    active: "true",
    closed: "false",
    order: "volume24hr",
    ascending: "false",
  });
  if (q)        params.set("_c", q);       // Gamma full-text search param
  if (category && CATEGORY_TAG_MAP[category]) params.set("tag", CATEGORY_TAG_MAP[category]);

  try {
    const data = await fetchJson(`${GAMMA_BASE}/markets?${params}`);
    const markets = (Array.isArray(data) ? data : data.markets || []).map(m => ({
      id:            m.id,
      conditionId:   m.conditionId,
      question:      m.question,
      slug:          m.slug,
      category:      m.category || category || "general",
      outcomes:      safeJson(m.outcomes, ["Yes", "No"]),
      outcomePrices: safeJson(m.outcomePrices, ["0.5", "0.5"]),
      clobTokenIds:  safeJson(m.clobTokenIds, []),
      volume:        parseFloat(m.volume || 0),
      volume24hr:    parseFloat(m.volume24hr || 0),
      liquidity:     parseFloat(m.liquidity || 0),
      endDate:       m.endDate || null,
      active:        m.active !== false,
      featured:      m.featured || false,
      imageOptimized: m.imageOptimized || null,
    }));
    return res.json({ ok: true, markets, count: markets.length });
  } catch (err) {
    console.error("[API/polymarket] markets error:", err.message);
    return res.json({ ok: false, markets: [], error: err.message });
  }
}

async function handleEvents(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60");
  const limit    = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
  const category = String(req.query.category || "").toLowerCase();

  const params = new URLSearchParams({ active: "true", closed: "false", limit: String(limit) });
  if (category && CATEGORY_TAG_MAP[category]) params.set("tag", CATEGORY_TAG_MAP[category]);

  try {
    const data = await fetchJson(`${GAMMA_BASE}/events?${params}`);
    const events = (Array.isArray(data) ? data : data.events || []).map(e => ({
      id:        e.id,
      title:     e.title,
      slug:      e.slug,
      category:  e.category || category,
      volume:    parseFloat(e.volume || 0),
      liquidity: parseFloat(e.liquidity || 0),
      endDate:   e.endDate || null,
      markets:   (e.markets || []).slice(0, 5).map(m => ({
        id:            m.id,
        question:      m.question,
        outcomePrices: safeJson(m.outcomePrices, ["0.5", "0.5"]),
        clobTokenIds:  safeJson(m.clobTokenIds, []),
      })),
    }));
    return res.json({ ok: true, events, count: events.length });
  } catch (err) {
    console.error("[API/polymarket] events error:", err.message);
    return res.json({ ok: false, events: [], error: err.message });
  }
}

async function handlePrices(req, res) {
  res.setHeader("Cache-Control", "public, max-age=5");
  const tokenId = String(req.query.token_id || "").trim();
  if (!tokenId) return res.status(400).json({ ok: false, error: "Missing token_id" });

  try {
    const [buy, sell] = await Promise.all([
      fetchJson(`${CLOB_BASE}/price?token_id=${encodeURIComponent(tokenId)}&side=buy`),
      fetchJson(`${CLOB_BASE}/price?token_id=${encodeURIComponent(tokenId)}&side=sell`),
    ]);
    const buyPrice  = parseFloat(buy.price  || buy.mid  || 0);
    const sellPrice = parseFloat(sell.price || sell.mid || 0);
    return res.json({
      ok: true,
      token_id:  tokenId,
      buy_price:  buyPrice,
      sell_price: sellPrice,
      mid_price:  ((buyPrice + sellPrice) / 2),
      spread:     Math.abs(buyPrice - sellPrice),
    });
  } catch (err) {
    console.error("[API/polymarket] prices error:", err.message);
    return res.json({ ok: false, token_id: tokenId, error: err.message });
  }
}

async function handleOrderBook(req, res) {
  res.setHeader("Cache-Control", "public, max-age=5");
  const tokenId = String(req.query.token_id || "").trim();
  if (!tokenId) return res.status(400).json({ ok: false, error: "Missing token_id" });

  try {
    const data = await fetchJson(`${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`);
    return res.json({
      ok:     true,
      token_id: tokenId,
      bids:   (data.bids   || []).slice(0, 5),
      asks:   (data.asks   || []).slice(0, 5),
      spread: data.spread  || null,
    });
  } catch (err) {
    console.error("[API/polymarket] orderbook error:", err.message);
    return res.json({ ok: false, token_id: tokenId, error: err.message });
  }
}

async function handleOrder(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });

  const apiKey        = String(req.headers["x-poly-key"]         || "").trim();
  const apiSecret     = String(req.headers["x-poly-secret"]      || "").trim();
  const apiPassphrase = String(req.headers["x-poly-passphrase"]  || "").trim();
  const funder        = String(req.headers["x-poly-funder"]      || "").trim();

  if (!apiKey || !apiSecret || !apiPassphrase || !funder) {
    return res.status(401).json({ ok: false, error: "Polymarket L2 credentials required. Add them in your profile settings." });
  }

  const { token_id, side, price, size } = req.body || {};
  if (!token_id || !side || !price || !size) {
    return res.status(400).json({ ok: false, error: "Missing required fields: token_id, side, price, size" });
  }

  try {
    const { ClobClient, Chain, Side } = require("@polymarket/clob-client");
    const client = new ClobClient(
      "https://clob.polymarket.com",
      Chain.POLYGON,
      null,
      { key: apiKey, secret: apiSecret, passphrase: apiPassphrase },
      1 // SignatureType.POLY_PROXY
    );

    const orderSide = String(side).toUpperCase() === "BUY" ? Side.BUY : Side.SELL;
    const order = await client.createOrder({
      tokenID: String(token_id),
      price:   parseFloat(price),
      side:    orderSide,
      size:    parseFloat(size),
      funder:  funder,
    });
    const result = await client.postOrder(order);
    return res.json({ ok: true, order: result });
  } catch (err) {
    console.error("[API/polymarket] order error:", err.message);
    return res.json({ ok: false, error: err.message || "Order failed" });
  }
}

function safeJson(val, fallback) {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}

module.exports = async function handler(req, res) {
  const action = String(req.query.action || "markets");
  switch (action) {
    case "markets":   return handleMarkets(req, res);
    case "events":    return handleEvents(req, res);
    case "prices":    return handlePrices(req, res);
    case "orderbook": return handleOrderBook(req, res);
    case "order":     return handleOrder(req, res);
    default: return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  }
};
