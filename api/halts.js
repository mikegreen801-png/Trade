/**
 * NASDAQ trading halt list proxy — /api/halts
 * Data: NASDAQ dynamic halt file, public, no key required
 * Format: pipe-delimited, refreshes throughout the trading day
 */

const https = require("https");

const REASON_MAP = {
  T1:   "News Pending",
  T2:   "News Released",
  T3:   "News and Resumption Times",
  T5:   "Single Stock Circuit Breaker",
  T6:   "Extraordinary Market Activity",
  T8:   "ETF Component",
  T12:  "Additional Information Requested",
  H4:   "Non-Compliance",
  H9:   "Not Current in Reporting",
  H10:  "SEC Trading Suspension",
  H11:  "Regulatory Concern",
  LUDP: "Limit Up/Down Pause",
  LUDS: "Limit Up/Down Straddle",
  IPO1: "IPO Not Yet Trading",
  M:    "Market-Wide Circuit Breaker",
  MWC1: "Market-Wide Circuit Breaker Level 1",
  MWC2: "Market-Wide Circuit Breaker Level 2",
  MWC3: "Market-Wide Circuit Breaker Level 3",
  R4:   "Qualifications Issues Resolved",
  R9:   "Filing Requirements Satisfied",
  C3:   "Issuer News Not Forthcoming",
  C4:   "Qualifications Halt Ended",
  C9:   "Not Current — Resolved",
  C11:  "Regulatory Concern — Resolved",
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "DayTraderOS/1.0" } }, (res) => {
      let raw = "";
      res.on("data", d => { raw += d; });
      res.on("end", () => resolve(raw));
    }).on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60");

  try {
    const text = await fetchText("https://www.nasdaqtrader.com/dynamic/halts/halts.txt");
    const lines = text.split(/\r?\n/).filter(Boolean);

    // First line is header: Symbol|MarketCode|ReasonCode|HaltDate|HaltTime|ResumeDate|ResumeTime|PauseThreshold|...
    const halts = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split("|");
      if (parts.length < 5) continue;
      const [symbol, market, reasonCode, haltDate, haltTime, resumeDate, resumeTime] = parts;
      if (!symbol || symbol === "Symbol") continue;
      halts.push({
        symbol:     symbol.trim(),
        market:     market.trim(),
        reasonCode: reasonCode.trim(),
        reason:     REASON_MAP[reasonCode.trim()] || reasonCode.trim(),
        haltDate:   haltDate.trim(),
        haltTime:   haltTime.trim(),
        resumeDate: (resumeDate || "").trim(),
        resumeTime: (resumeTime || "").trim(),
      });
    }

    return res.json({ ok: true, halts, count: halts.length });
  } catch (err) {
    console.error("[API/halts] error:", err.message);
    return res.json({ ok: false, halts: [], error: err.message });
  }
};
