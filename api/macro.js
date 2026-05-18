/**
 * Macro Data API — /api/macro
 * Aggregates high-level institutional market barometers.
 * - SPY/QQQ basic indices
 * - Crypto Fear & Greed (alternative.me)
 * - Polymarket top macro markets
 */

const https = require("https");
const cache = require("./cache");
const AlpacaClient = require("./alpaca-client");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  const cacheKey = "macro:aggregated";
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    // 1. Fetch Fear & Greed
    let fearGreed = { name: "Neutral", value: 50 };
    try {
      const fgData = await fetchJson("https://api.alternative.me/fng/?limit=1");
      if (fgData && fgData.data && fgData.data.length) {
        fearGreed = {
          name: fgData.data[0].value_classification,
          value: parseInt(fgData.data[0].value)
        };
      }
    } catch (e) { console.error("Fear/Greed error", e.message); }

    // 2. Fetch Polymarket macro markets (tag: 'politics' or 'macro' or 'global-macro')
    let polymarketStats = [];
    try {
      const pmData = await fetchJson("https://gamma-api.polymarket.com/events?active=true&closed=false&limit=3");
      if (pmData && pmData.length) {
        polymarketStats = pmData.map(e => ({
          title: e.title,
          url: "https://polymarket.com/event/" + e.slug
        }));
      }
    } catch (e) { console.error("Polymarket error", e.message); }

    // 3. Fetch Indices Snapshot
    let indices = { SPY: null, QQQ: null, BTC: null };
    try {
      const client = new AlpacaClient();
      const bars = await client.getLatestBars("SPY,QQQ,BTC/USD");
      if (bars.SPY) indices.SPY = { price: parseFloat(bars.SPY.c) };
      if (bars.QQQ) indices.QQQ = { price: parseFloat(bars.QQQ.c) };
      if (bars["BTC/USD"]) indices.BTC = { price: parseFloat(bars["BTC/USD"].c) };
    } catch (e) { console.error("Alpaca indices error", e.message); }

    const payload = {
      ok: true,
      data: {
        fearGreed,
        polymarket: polymarketStats,
        indices
      }
    };

    cache.set(cacheKey, payload, 300_000); // 5 minutes cache
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
