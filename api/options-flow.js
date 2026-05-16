/**
 * Options flow sweep detector — /api/options-flow?symbols=AAPL,TSLA,...
 * Data: Yahoo Finance options chain, public, no key required
 * Sweep criteria: volume >= 200, vol/OI >= 2.5, premium >= $25K
 */

const https = require("https");

const DEFAULT_SYMBOLS = [
  "SPY","QQQ","AAPL","TSLA","NVDA","AMD","META","MSFT","AMZN","GOOGL",
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DayTraderOS/1.0)",
        "Accept": "application/json",
      },
    };
    https.get(url, opts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return https.get(res.headers.location, opts, (res2) => {
          let raw = "";
          res2.on("data", d => { raw += d; });
          res2.on("end", () => {
            try { resolve(JSON.parse(raw)); }
            catch { reject(new Error("Non-JSON")); }
          });
        }).on("error", reject);
      }
      let raw = "";
      res.on("data", d => { raw += d; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error("Non-JSON")); }
      });
    }).on("error", reject);
  });
}

function detectSweeps(symbol, contracts, type) {
  return contracts
    .filter(c => {
      const vol = c.volume || 0;
      const oi  = c.openInterest || 1;
      const last = c.lastPrice || 0;
      const premium = last * vol * 100;
      return vol >= 200 && vol / oi >= 2.5 && premium >= 25000;
    })
    .map(c => {
      const vol = c.volume || 0;
      const oi  = c.openInterest || 1;
      const last = c.lastPrice || 0;
      return {
        symbol,
        type,
        strike:      c.strike || 0,
        expiry:      c.expiration || c.expirationDate || "",
        bid:         c.bid || 0,
        ask:         c.ask || 0,
        lastPrice:   last,
        volume:      vol,
        openInterest: oi,
        volOiRatio:  parseFloat((vol / oi).toFixed(2)),
        premiumEst:  Math.round(last * vol * 100),
        sentiment:   type === "call" ? "bullish" : "bearish",
        impliedVolatility: c.impliedVolatility ? parseFloat((c.impliedVolatility * 100).toFixed(1)) : null,
      };
    });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=90");

  const raw     = String(req.query.symbols || "").trim();
  const symbols = raw
    ? raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 15)
    : DEFAULT_SYMBOLS;

  const results = await Promise.allSettled(
    symbols.map(sym =>
      fetchJson(`https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}`)
        .then(data => {
          const chain = data?.optionChain?.result?.[0];
          if (!chain) return [];

          const options = chain.options?.[0];
          if (!options) return [];

          const calls = detectSweeps(sym, options.calls || [], "call");
          const puts  = detectSweeps(sym, options.puts  || [], "put");
          return [...calls, ...puts];
        })
        .catch(() => [])
    )
  );

  const all = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .sort((a, b) => b.premiumEst - a.premiumEst)
    .slice(0, 30);

  return res.json({ ok: true, sweeps: all, count: all.length });
};
