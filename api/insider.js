/**
 * SEC EDGAR Form 4 insider trades proxy — /api/insider?limit=40
 * Data: EDGAR full-text search, public, no key required
 */

const https = require("https");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "DayTraderOS/1.0 contact@daytrader.os" } }, (res) => {
      let raw = "";
      res.on("data", d => { raw += d; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Non-JSON from ${url}`)); }
      });
    }).on("error", reject);
  });
}

function dateStr(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");

  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit) || 40));

  const params = new URLSearchParams({
    q: '"form 4"',
    dateRange: "custom",
    startdt: dateStr(2),
    enddt: dateStr(0),
    "hits.hits.total.value": "true",
    "hits.hits._source": "period_of_report,display_names,file_date,entity_id",
  });

  try {
    const data = await fetchJson(
      `https://efts.sec.gov/LATEST/search-index?${params}`
    );

    const hits = (data.hits && data.hits.hits) ? data.hits.hits : [];

    const filings = hits.slice(0, limit).map(hit => {
      const src = hit._source || hit.fields || {};
      const names = src.display_names || [];

      // display_names: [{name, id}] — first is usually the issuer, second the filer
      const issuerEntry = names.find(n => n.id && !n.id.startsWith("ticker:")) || names[0] || {};
      const tickerEntry = names.find(n => n.id && n.id.startsWith("ticker:")) || {};
      const filerEntry  = names.length > 1 ? names[names.length - 1] : {};

      const issuer = issuerEntry.name || "Unknown";
      const ticker = tickerEntry.id ? tickerEntry.id.replace("ticker:", "") : "";
      const filer  = filerEntry.name && filerEntry !== issuerEntry ? filerEntry.name : "";
      const fileDate = src.file_date || "";
      const cik = issuerEntry.id || "";

      const url = cik
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=10`
        : `https://efts.sec.gov/LATEST/search-index?q=%22form+4%22`;

      return { issuer, ticker, cik, filer, fileDate, url };
    }).filter(f => f.issuer && f.issuer !== "Unknown");

    return res.json({ ok: true, filings, count: filings.length });
  } catch (err) {
    console.error("[API/insider] error:", err.message);
    return res.json({ ok: false, filings: [], error: err.message });
  }
};
