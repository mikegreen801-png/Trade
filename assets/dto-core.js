/* dto-core.js — Shared business logic and state for Day Trader OS */
(function() {
  "use strict";

  const STORAGE_KEY = "dto_engine_state";

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (error) { return fallback; }
  }

  function formatMoney(value) {
    const sign = value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  }

  function formatVolume(v) {
    if (!v || !Number.isFinite(v)) return "--";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toString();
  }

  function compactNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }

  function fmtPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    const decimals = n >= 100 ? 2 : n >= 1 ? 3 : 5;
    return `$${n.toFixed(decimals).replace(/\.?0+$/, "")}`;
  }

  function avg(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function rsi(closes, period = 14) {
    if (closes.length <= period) return null;
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  const cryptoMap = {
    BTC: "BINANCE:BTCUSDT",
    BITCOIN: "BINANCE:BTCUSDT",
    ETH: "BINANCE:ETHUSDT",
    ETHEREUM: "BINANCE:ETHUSDT",
    SOL: "BINANCE:SOLUSDT",
    SOLANA: "BINANCE:SOLUSDT",
    DOGE: "BINANCE:DOGEUSDT",
    DOGECOIN: "BINANCE:DOGEUSDT",
    XRP: "BINANCE:XRPUSDT",
    ADA: "BINANCE:ADAUSDT",
    CARDANO: "BINANCE:ADAUSDT",
    BNB: "BINANCE:BNBUSDT",
    AVAX: "BINANCE:AVAXUSDT",
    LINK: "BINANCE:LINKUSDT",
    SUI: "BINANCE:SUIUSDT",
    PEPE: "BINANCE:PEPEUSDT",
    SHIB: "BINANCE:SHIBUSDT",
    LTC: "BINANCE:LTCUSDT",
    BCH: "BINANCE:BCHUSDT",
    DOT: "BINANCE:DOTUSDT",
    MATIC: "BINANCE:MATICUSDT",
    POL: "BINANCE:POLUSDT"
  };

  const cryptoDataMap = {
    BTC: "BTCUSDT",
    BITCOIN: "BTCUSDT",
    ETH: "ETHUSDT",
    ETHEREUM: "ETHUSDT",
    SOL: "SOLUSDT",
    SOLANA: "SOLUSDT",
    DOGE: "DOGEUSDT",
    DOGECOIN: "DOGEUSDT",
    XRP: "XRPUSDT",
    ADA: "ADAUSDT",
    CARDANO: "ADAUSDT",
    BNB: "BNBUSDT",
    AVAX: "AVAXUSDT",
    LINK: "LINKUSDT",
    SUI: "SUIUSDT",
    PEPE: "PEPEUSDT",
    SHIB: "SHIBUSDT",
    LTC: "LTCUSDT",
    BCH: "BCHUSDT",
    DOT: "DOTUSDT",
    MATIC: "MATICUSDT",
    POL: "POLUSDT"
  };

  function isCryptoSymbol(rawSymbol) {
    const clean = cleanSymbol(rawSymbol);
    return Boolean(cryptoDataMap[clean] || /(?:USDT|USD)$/.test(clean) && clean.length > 4);
  }

  function tradingViewSymbol(rawSymbol) {
    const clean = String(rawSymbol || "AAPL").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    if (!clean) return "NASDAQ:AAPL";
    if (clean.includes(":")) return clean;
    if (cryptoMap[clean]) return cryptoMap[clean];
    const exchangeMap = {
      AAPL: "NASDAQ:AAPL",
      MSFT: "NASDAQ:MSFT",
      NVDA: "NASDAQ:NVDA",
      TSLA: "NASDAQ:TSLA",
      META: "NASDAQ:META",
      AMZN: "NASDAQ:AMZN",
      GOOGL: "NASDAQ:GOOGL",
      GOOG: "NASDAQ:GOOG",
      AMD: "NASDAQ:AMD",
      INTC: "NASDAQ:INTC",
      AVGO: "NASDAQ:AVGO",
      MU: "NASDAQ:MU",
      QCOM: "NASDAQ:QCOM",
      ARM: "NASDAQ:ARM",
      SMCI: "NASDAQ:SMCI",
      COIN: "NASDAQ:COIN",
      MSTR: "NASDAQ:MSTR",
      PLTR: "NASDAQ:PLTR",
      SOFI: "NASDAQ:SOFI",
      RIVN: "NASDAQ:RIVN",
      LCID: "NASDAQ:LCID",
      MARA: "NASDAQ:MARA",
      RIOT: "NASDAQ:RIOT",
      NFLX: "NASDAQ:NFLX",
      SPY: "AMEX:SPY",
      QQQ: "NASDAQ:QQQ",
      DIA: "AMEX:DIA",
      IWM: "AMEX:IWM",
      GLD: "AMEX:GLD",
      SLV: "AMEX:SLV",
      IBM: "NYSE:IBM",
      DIS: "NYSE:DIS",
      JPM: "NYSE:JPM",
      BAC: "NYSE:BAC",
      WMT: "NYSE:WMT",
      XOM: "NYSE:XOM",
      CVX: "NYSE:CVX",
      BA: "NYSE:BA",
      F: "NYSE:F",
      GM: "NYSE:GM",
      NKE: "NYSE:NKE",
      KO: "NYSE:KO",
      PFE: "NYSE:PFE"
    };
    return exchangeMap[clean] || clean;
  }

  function tradingViewUrl(rawSymbol) {
    return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol(rawSymbol))}`;
  }

  function tradingViewEmbedUrl(rawSymbol) {
    const symbol = encodeURIComponent(tradingViewSymbol(rawSymbol));
    return `https://s.tradingview.com/widgetembed/?symbol=${symbol}&interval=60&hidesidetoolbar=1&symboledit=1&saveimage=0&toolbarbg=ffffff&theme=light&style=1&timezone=America%2FNew_York&withdateranges=1&hideideas=1&locale=en`;
  }

  function sourceUrls(rawSymbol) {
    const symbol = cleanSymbol(rawSymbol);
    const isCrypto = Boolean(cryptoDataMap[symbol]);
    const cryptoBase = isCrypto ? String(cryptoDataMap[symbol]).replace(/USDT$/, "") : symbol;
    const yahooSymbol = isCrypto ? `${cryptoBase}-USD` : symbol;
    const searchQuery = encodeURIComponent(`${symbol} stock crypto market news`);
    return {
      tradingView: tradingViewUrl(symbol),
      yahoo: `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}`,
      cnbc: `https://www.cnbc.com/search/?query=${encodeURIComponent(symbol)}`,
      marketWatch: isCrypto
        ? `https://www.marketwatch.com/search?q=${encodeURIComponent(symbol)}`
        : `https://www.marketwatch.com/investing/stock/${encodeURIComponent(symbol.toLowerCase())}`,
      nasdaq: isCrypto
        ? `https://www.nasdaq.com/search?q=${encodeURIComponent(symbol)}`
        : `https://www.nasdaq.com/market-activity/stocks/${encodeURIComponent(symbol.toLowerCase())}`,
      ground: `https://ground.news/search?q=${searchQuery}`,
      finviz: isCrypto
        ? `https://finviz.com/crypto.ashx`
        : `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`
    };
  }

  function sourceDeckHtml(rawSymbol) {
    const urls = sourceUrls(rawSymbol);
    return `<div class="source-deck" aria-label="Reliable market source links">
      <a href="${escapeHtml(urls.tradingView)}" target="_blank" rel="noopener">TradingView</a>
      <a href="${escapeHtml(urls.yahoo)}" target="_blank" rel="noopener">Yahoo Finance</a>
      <a href="${escapeHtml(urls.cnbc)}" target="_blank" rel="noopener">CNBC</a>
      <a href="${escapeHtml(urls.marketWatch)}" target="_blank" rel="noopener">MarketWatch</a>
      <a href="${escapeHtml(urls.nasdaq)}" target="_blank" rel="noopener">Nasdaq</a>
      <a href="${escapeHtml(urls.ground)}" target="_blank" rel="noopener">Ground News</a>
    </div>`;
  }

  function cleanSymbol(rawSymbol) {
    return String(rawSymbol || "AAPL").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "") || "AAPL";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function isStaticOnlyHost() {
    const host = location.hostname || "";
    // Static-only hosting platforms where /api/* won't exist
    return /\.github\.io$/i.test(host)
      || /\.pages\.dev$/i.test(host)
      || host === ""
      || location.protocol === "file:";
  }

  function marketProxySources(url, label = "feed") {
    return [
      { url, label: `${label} direct` },
      { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, label: `${label} AllOrigins` },
      { url: `https://corsproxy.io/?${encodeURIComponent(url)}`, label: `${label} CORS proxy` },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, label: `${label} CodeTabs` }
    ];
  }

  async function fetchJson(url, label = "feed") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`${label} returned ${response.status}`);
      const text = await response.text();
      return JSON.parse(text);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchPublicApiJson(path, label = "public API") {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    const urls = [`/api/${cleanPath}`, `/.netlify/functions/${cleanPath}`];
    let lastError = null;
    for (const url of urls) {
      try {
        return await fetchJson(url, label);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`${label} unavailable`);
  }

  async function fetchText(url, label = "feed") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`${label} returned ${response.status}`);
      return response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchJsonWithFallback(url, label = "feed") {
    let lastError = null;
    for (const source of marketProxySources(url, label)) {
      try {
        return await fetchJson(source.url, source.label);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`${label} unavailable`);
  }

  async function fetchTextWithFallback(url, label = "feed") {
    let lastError = null;
    for (const source of marketProxySources(url, label)) {
      try {
        return await fetchText(source.url, source.label);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`${label} unavailable`);
  }

  async function fetchBackendCandles(rawSymbol) {
    if (!/^https?:$/.test(location.protocol)) {
      throw new Error("Backend candle proxy is only available when the app is hosted, not from file://.");
    }
    const symbol = cleanSymbol(rawSymbol);
    const data = await fetchPublicApiJson(`candles?symbol=${encodeURIComponent(symbol)}&limit=160`, "Public candle proxy");
    const candles = (data?.candles || []).map(candle => ({
      time: candle.time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume)
    })).filter(candle => Number.isFinite(candle.close) && Number.isFinite(candle.high) && Number.isFinite(candle.low));
    if (!candles.length) throw new Error(data?.error || "No backend candles returned");
    candles.source = data?.source || "Public candle proxy";
    candles.delayed = Boolean(data?.delayed);
    return candles;
  }

  function parseYahooCandles(data) {
    const result = data.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!quote?.close?.length) throw new Error("No candles returned");
    return quote.close.map((close, index) => ({
      time: result.timestamp?.[index],
      open: Number(quote.open?.[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      close: Number(close),
      volume: Number(quote.volume?.[index])
    })).filter(candle => Number.isFinite(candle.close) && Number.isFinite(candle.high) && Number.isFinite(candle.low));
  }

  function parseStooqCandles(csv) {
    const lines = String(csv || "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 20 || !/^date,/i.test(lines[0])) throw new Error("No Stooq candles returned");
    return lines.slice(1).map(line => {
      const [date, open, high, low, close, volume] = line.split(",");
      const time = Math.floor(new Date(`${date}T16:00:00-05:00`).getTime() / 1000);
      return {
        time,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume)
      };
    }).filter(candle => Number.isFinite(candle.close) && Number.isFinite(candle.high) && Number.isFinite(candle.low));
  }

  async function fetchStooqDailyCandles(symbol) {
    const stooqSymbol = `${cleanSymbol(symbol).toLowerCase()}.us`;
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
    const candles = parseStooqCandles(await fetchTextWithFallback(url, "Stooq daily candles")).slice(-180);
    if (!candles.length) throw new Error("Stooq delayed daily feed unavailable");
    candles.source = "Stooq delayed daily candles";
    candles.delayed = true;
    return candles;
  }

  async function fetchStockCandles(symbol) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1h&includePrePost=true`;
    let lastError = null;
    for (const source of marketProxySources(yahooUrl, "Yahoo candles")) {
      try {
        const candles = parseYahooCandles(await fetchJson(source.url, source.label));
        if (candles.length) {
          candles.source = source.label;
          return candles;
        }
      } catch (error) {
        lastError = error;
      }
    }
    try {
      return await fetchStooqDailyCandles(symbol);
    } catch (error) {
      lastError = error;
    }
    throw lastError || new Error("Stock candle feed unavailable");
  }

  async function fetchCryptoCandles(symbol) {
    const pair = cryptoDataMap[symbol];
    const urls = [
      `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=1h&limit=160`,
      `https://api.binance.us/api/v3/klines?symbol=${pair}&interval=1h&limit=160`,
      `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1h&limit=160`
    ];
    let lastError = null;
    for (const url of urls) {
      try {
        const rows = await fetchJson(url);
        const candles = rows.map(row => ({
          time: row[0],
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5])
        })).filter(candle => Number.isFinite(candle.close) && Number.isFinite(candle.high) && Number.isFinite(candle.low));
        if (candles.length) {
          candles.source = "Binance/Coinbase crypto candles";
          return candles;
        }
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Crypto candle feed unavailable");
  }

  async function fetchCandles(rawSymbol) {
    const symbol = cleanSymbol(rawSymbol);
    let backendError = null;
    const shouldPreferBackendError = /^https?:$/.test(location.protocol) && !isStaticOnlyHost();
    try {
      return await fetchBackendCandles(symbol);
    } catch (error) {
      backendError = error;
    }
    try {
      if (cryptoDataMap[symbol]) return await fetchCryptoCandles(symbol);
      return await fetchStockCandles(symbol);
    } catch (error) {
      throw backendError && shouldPreferBackendError ? backendError : error;
    }
  }

  function nearestLevel(values, price, direction) {
    const filtered = values.filter(value => direction === "above" ? value > price : value < price);
    if (!filtered.length) return null;
    return filtered.reduce((best, value) => Math.abs(value - price) < Math.abs(best - price) ? value : best, filtered[0]);
  }

  function pctDistance(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || !from) return "--";
    return `${(((to - from) / from) * 100).toFixed(2)}%`;
  }

  function marketContextForSymbol(symbol, news = []) {
    const clean = cleanSymbol(symbol);
    const isCrypto = isCryptoSymbol(clean);
    const groundQuery = `${clean} ${isCrypto ? "crypto" : "stock"} market news`;
    const headlineItems = (news || []).map(item => {
      if (typeof item === "string") return { title: item, publisher: "Market feed", url: "" };
      return item;
    }).filter(item => item && item.title);
    return {
      summary: [
        headlineItems.length
          ? `${headlineItems.length} headline/context item${headlineItems.length === 1 ? "" : "s"} loaded for ${clean}.`
          : `No source headlines loaded yet for ${clean}; use the source checks below before acting.`,
        isCrypto
          ? "Crypto context should include BTC/ETH direction, exchange liquidity, token unlocks, regulation, and macro risk appetite."
          : "Equity context should include same-day headlines, earnings, filings, sector beta, macro calendar, and peer strength.",
        "Treat this as context for planning; the chart and risk map still decide the trade."
      ],
      feeds: {
        headlines: headlineItems,
        yahoo: {
          label: "Yahoo Finance quote/news",
          query: `${clean} finance news`,
          url: `https://finance.yahoo.com/quote/${encodeURIComponent(clean)}`
        },
        cnbc: {
          label: "CNBC ticker/news search",
          query: `${clean} market news`,
          url: `https://www.cnbc.com/search/?query=${encodeURIComponent(clean + " market news")}`
        },
        earnings: {
          label: isCrypto ? "Token/events calendar" : "Earnings calendar",
          query: isCrypto ? `${clean} crypto events token unlock news` : `${clean} earnings calendar`,
          url: isCrypto ? `https://www.coindesk.com/search?s=${encodeURIComponent(clean)}` : `https://finance.yahoo.com/calendar/earnings?symbol=${encodeURIComponent(clean)}`
        },
        sec: {
          label: isCrypto ? "Regulatory / exchange news" : "SEC/company releases",
          query: isCrypto ? `${clean} regulation exchange listing news` : `${clean} filings`,
          url: isCrypto ? `https://www.coindesk.com/search?s=${encodeURIComponent(clean + " regulation")}` : `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(clean)}`
        },
        macro: {
          label: "Macro calendar",
          query: `${clean} rates dollar yields macro market impact`,
          url: "https://www.marketwatch.com/economy-politics/calendar"
        },
        sector: {
          label: isCrypto ? "Crypto beta / BTC ETH" : "Sector / beta check",
          query: isCrypto ? `${clean} BTC ETH relative strength liquidity` : `${clean} sector ETF peers relative strength`,
          url: isCrypto ? "https://www.coinglass.com/" : `https://finance.yahoo.com/quote/${encodeURIComponent(clean)}/comparison/`
        },
        groundNews: {
          label: "Ground News source balance",
          query: groundQuery,
          url: `https://ground.news/search?q=${encodeURIComponent(groundQuery)}`
        }
      }
    };
  }
  function avgRange(candles) {
    const ranges = candles.map(candle => Math.abs(candle.high - candle.low)).filter(Number.isFinite);
    return avg(ranges.slice(-14)) || 0;
  }

  function tradeLevels({ rating, price, support, resistance, candles }) {
    const atr = avgRange(candles);
    const buffer = Math.max(price * 0.0025, atr * 0.35);
    const bullish = rating === "BUY";
    const bearish = rating === "SELL";
    let entry = price;
    let stop = bullish ? support - buffer : bearish ? resistance + buffer : support - buffer;
    let target = bullish ? resistance : bearish ? support : resistance;
    if (bullish && target <= price) target = price + Math.max(buffer * 2, Math.abs(price - stop) * 2);
    if (bearish && target >= price) target = price - Math.max(buffer * 2, Math.abs(stop - price) * 2);
    if (!bullish && !bearish) {
      entry = price;
      stop = support - buffer;
      target = resistance;
    }
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    return {
      entry,
      stop,
      target,
      riskReward: risk ? reward / risk : null,
      buffer,
      atr
    };
  }

  function analyzeCandles(rawSymbol, candles) {
    const symbol = cleanSymbol(rawSymbol);
    const recent = candles.slice(-80);
    const closes = recent.map(c => c.close);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);
    const volumes = recent.map(c => c.volume).filter(Number.isFinite);
    const price = closes[closes.length - 1];
    const previous = closes[closes.length - 2] || price;
    const top = Math.max(...highs);
    const bottom = Math.min(...lows);
    const sma20 = avg(closes.slice(-20));
    const sma50 = avg(closes.slice(-50));
    const rsiValue = rsi(closes);
    const avgVol = avg(volumes.slice(-50));
    const lastVol = volumes[volumes.length - 1] || 0;
    const volRatio = avgVol ? lastVol / avgVol : null;
    const pivotHighs = recent.slice(2, -2).filter((c, i) => c.high > recent[i + 1].high && c.high > recent[i + 3].high).map(c => c.high);
    const pivotLows = recent.slice(2, -2).filter((c, i) => c.low < recent[i + 1].low && c.low < recent[i + 3].low).map(c => c.low);
    const resistance = nearestLevel(pivotHighs.length ? pivotHighs : highs, price, "above") || top;
    const support = nearestLevel(pivotLows.length ? pivotLows : lows, price, "below") || bottom;
    const change = ((price - previous) / previous) * 100;
    const rangePosition = ((price - bottom) / (top - bottom || 1)) * 100;

    let score = 50;
    const rationale = [];
    if (sma20 && price > sma20) { score += 10; rationale.push(`Price is above the 20-period average (${fmtPrice(sma20)}), which supports bullish momentum.`); }
    if (sma20 && price < sma20) { score -= 10; rationale.push(`Price is below the 20-period average (${fmtPrice(sma20)}), which weakens the setup.`); }
    if (sma50 && price > sma50) { score += 8; rationale.push(`Price is above the 50-period average (${fmtPrice(sma50)}), keeping the broader short-term trend constructive.`); }
    if (sma50 && price < sma50) { score -= 8; rationale.push(`Price is below the 50-period average (${fmtPrice(sma50)}), so trend confirmation is weaker.`); }
    if (change > 0.5) { score += 6; rationale.push(`Recent candle change is positive (${change.toFixed(2)}%), showing near-term buying pressure.`); }
    if (change < -0.5) { score -= 6; rationale.push(`Recent candle change is negative (${change.toFixed(2)}%), showing near-term selling pressure.`); }
    if (rsiValue !== null && rsiValue >= 55 && rsiValue <= 68) { score += 7; rationale.push(`RSI near ${rsiValue.toFixed(0)} shows momentum without being extremely stretched.`); }
    if (rsiValue !== null && rsiValue > 72) { score -= 7; rationale.push(`RSI near ${rsiValue.toFixed(0)} is stretched, so chasing is higher risk.`); }
    if (rsiValue !== null && rsiValue < 35) { score -= 5; rationale.push(`RSI near ${rsiValue.toFixed(0)} shows weakness unless a reversal forms.`); }
    if (price > (support || bottom) && resistance > price) rationale.push(`Nearest support is ${fmtPrice(support)} and nearest resistance is ${fmtPrice(resistance)}.`);
    if (volRatio) rationale.push(`Current candle volume is about ${volRatio.toFixed(1)}x the recent average, which ${volRatio >= 1.2 ? "adds conviction to the move" : "means confirmation is lighter than ideal"}.`);
    rationale.push(`Price sits around ${Math.max(0, Math.min(100, rangePosition)).toFixed(0)}% of the recent candle range from ${fmtPrice(bottom)} to ${fmtPrice(top)}.`);

    const clamped = Math.max(5, Math.min(95, Math.round(score)));
    const rating = clamped >= 64 ? "BUY" : clamped <= 40 ? "SELL" : "HOLD";
    const bullish = rating === "BUY";
    const bearish = rating === "SELL";
    const levels = tradeLevels({ rating, price, support, resistance, candles: recent });
    const entryText = bullish
      ? `Bullish entry idea: look for price to hold above ${fmtPrice(support)} and reclaim/continue through intraday strength before targeting ${fmtPrice(levels.target)}.`
      : bearish
        ? `Bearish entry idea: look for rejection below ${fmtPrice(resistance)} and weakness back toward ${fmtPrice(levels.target)} before pressing short.`
        : `Neutral entry idea: wait for a decisive break above ${fmtPrice(resistance)} or a clean reclaim from ${fmtPrice(support)} instead of forcing a middle-of-range trade.`;
    const invalidationText = bullish
      ? `Invalidation: a clean loss of the buffered stop area near ${fmtPrice(levels.stop)} weakens the long setup and should force a reassessment.`
      : bearish
        ? `Invalidation: a clean reclaim above the buffered stop area near ${fmtPrice(levels.stop)} weakens the short setup and can trigger a squeeze.`
        : `Invalidation: chop between ${fmtPrice(support)} and ${fmtPrice(resistance)} means the edge is not clear enough yet.`;
    const rewardText = `Reward/risk map: entry ${fmtPrice(levels.entry)}, stop ${fmtPrice(levels.stop)}, target ${fmtPrice(levels.target)}, estimated R:R ${levels.riskReward ? levels.riskReward.toFixed(2) + "R" : "--"}. Price is ${pctDistance(price, support)} from support and ${pctDistance(price, resistance)} from resistance.`;
    const context = marketContextForSymbol(symbol);
    const catalystList = context.summary;

    return {
      symbol,
      name: `Explained rating from recent candle trend, momentum, and levels.`,
      rating,
      confidence: clamped,
      metrics: {
        price: fmtPrice(price),
        support: fmtPrice(support),
        resistance: fmtPrice(resistance),
        stop: fmtPrice(levels.stop),
        target: fmtPrice(levels.target),
        rr: levels.riskReward ? `${levels.riskReward.toFixed(2)}R` : "--",
        rsi: rsiValue === null ? "--" : rsiValue.toFixed(0),
        volume: lastVol ? formatVolume(lastVol) : "--"
      },
      raw: {
        price,
        support,
        resistance,
        stop: levels.stop,
        target: levels.target,
        rr: levels.riskReward,
        rsi: rsiValue,
        volume: lastVol
      },
      rationale: [
        ...rationale,
        entryText,
        invalidationText,
        rewardText
      ],
      news: catalystList,
      groundNews: {
        query: `${symbol} market news`,
        url: context.feeds.groundNews.url
      },
      marketContext: context,
    };
  }

  // --- 5A: WebSocket Streaming ---
  const activeStreams = new Map();

  function streamCryptoPrice(rawSymbol, onUpdate) {
    const symbol = cleanSymbol(rawSymbol);
    const pair = cryptoDataMap[symbol];
    if (!pair) return null;
    if (activeStreams.has(pair)) { try { activeStreams.get(pair).close(); } catch(e){} }
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@trade`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const price = Number(data.p);
        if (onUpdate && !isNaN(price)) onUpdate(price);
      } catch(e) {}
    };
    ws.onerror = () => {};
    activeStreams.set(pair, ws);
    return ws;
  }

  let _stockWs = null;
  const _stockCallbacks = new Map();

  function _ensureStockWs() {
    if (_stockWs && (_stockWs.readyState === WebSocket.OPEN || _stockWs.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    _stockWs = new WebSocket(`${proto}//${location.host}`);
    _stockWs.onopen = () => {
      const syms = [..._stockCallbacks.keys()];
      if (syms.length) _stockWs.send(JSON.stringify({ action: "subscribe", symbols: syms }));
    };
    _stockWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "stock" && msg.symbol && msg.price != null) {
          const cb = _stockCallbacks.get(msg.symbol);
          if (cb) cb(Number(msg.price));
        }
      } catch(e) {}
    };
    _stockWs.onerror = () => {};
    _stockWs.onclose = () => {
      _stockWs = null;
      if (_stockCallbacks.size > 0) setTimeout(_ensureStockWs, 3000);
    };
  }

  function streamStockPrice(rawSymbol, onUpdate) {
    const symbol = cleanSymbol(rawSymbol);
    _stockCallbacks.set(symbol, onUpdate);
    _ensureStockWs();
    if (_stockWs && _stockWs.readyState === WebSocket.OPEN)
      _stockWs.send(JSON.stringify({ action: "subscribe", symbols: [symbol] }));
  }

  function stopStream(rawSymbol) {
    const symbol = cleanSymbol(rawSymbol);
    const pair = cryptoDataMap[symbol];
    if (pair && activeStreams.has(pair)) {
      try { activeStreams.get(pair).close(); } catch(e) {}
      activeStreams.delete(pair);
    }
    if (_stockCallbacks.has(symbol)) {
      _stockCallbacks.delete(symbol);
      if (_stockWs && _stockWs.readyState === WebSocket.OPEN)
        _stockWs.send(JSON.stringify({ action: "unsubscribe", symbols: [symbol] }));
      if (_stockCallbacks.size === 0 && _stockWs) {
        try { _stockWs.close(); } catch(e) {}
        _stockWs = null;
      }
    }
  }

  window.streamCryptoPrice = streamCryptoPrice;
  window.streamStockPrice = streamStockPrice;
  window.stopStream = stopStream;

  // Expose core utilities for page scripts
  window.DTO = {
    readJson,
    formatMoney,
    compactNumber,
    fmtPrice,
    avg,
    rsi,
    isCryptoSymbol,
    tradingViewSymbol,
    tradingViewUrl,
    tradingViewEmbedUrl,
    sourceUrls,
    sourceDeckHtml,
    cleanSymbol,
    escapeHtml,
    isStaticOnlyHost,
    fetchJson,
    fetchPublicApiJson,
    fetchJsonWithFallback,
    fetchBackendCandles,
    fetchCandles,
    analyzeCandles,
    marketContextForSymbol,
    nearestLevel,
    pctDistance,
    tradeLevels,
    cryptoMap,
    cryptoDataMap,
    streamCryptoPrice,
    streamStockPrice,
    stopStream
  };