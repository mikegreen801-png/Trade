/**
 * Earnings calendar proxy — /api/earnings?symbols=AAPL,TSLA,...
 * Data: Yahoo Finance calendar/events, public, no key required
 */

const https = require("https");

const DEFAULT_SYMBOLS = [
  "AAPL","TSLA","NVDA","MSFT","META","AMZN","GOOGL","AMD",
  "NFLX","CRM","JPM","GS","COIN","HOOD","PLTR",
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
      // follow one redirect
      if (res.statusCode === 301 || res.statusCode === 302) {
        return https.get(res.headers.location, opts, (res2) => {
          let raw = "";
          res2.on("data", d => { raw += d; });
          res2.on("end", () => {
            try { resolve(JSON.parse(raw)); }
            catch { reject(new Error("Non-JSON response")); }
          });
        }).on("error", reject);
      }
      let raw = "";
      res.on("data", d => { raw += d; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error("Non-JSON response")); }
      });
    }).on("error", reject);
  });
}

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=3600");

  const raw     = String(req.query.symbols || "").trim();
  const symbols = raw ? raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20)
                      : DEFAULT_SYMBOLS;

  const now = Date.now();
  const sevenDays = 7 * 86400000;

  const results = await Promise.allSettled(
    symbols.map(sym =>
      fetchJson(`https://query1.finance.yahoo.com/v8/finance/calendar/events?symbol=${encodeURIComponent(sym)}`)
        .then(data => {
          const cal = data?.calendarEvents?.result?.[0];
          if (!cal) return null;

          const earningsArr = cal.earnings?.earningsDate || [];
          const eps = cal.earnings?.earningsAverage?.raw ?? null;
          const prevEps = cal.earnings?.earningsLow?.raw ?? null;

          for (const ts of earningsArr) {
            const ms = (typeof ts === "object" ? ts.raw : ts) * 1000;
            if (ms >= now && ms <= now + sevenDays) {
              const dt = new Date(ms);
              const when = ms < (new Date(dt.toDateString()).getTime() + 12 * 3600000) ? "bmo" : "amc";
              return {
                symbol:     sym,
                company:    cal.maxAge ? sym : sym,
                date:       dt.toISOString().slice(0, 10),
                dayName:    DAY_NAMES[dt.getDay()],
                when,
                epsEstimate: eps,
                prevEps,
              };
            }
          }
          return null;
        })
        .catch(() => null)
    )
  );

  const earnings = results
    .filter(r => r.status === "fulfilled" && r.value)
    .map(r => r.value)
    .sort((a, b) => a.date.localeCompare(b.date));

  return res.json({ ok: true, earnings, count: earnings.length });
};
