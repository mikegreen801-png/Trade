const CRYPTO_ALIASES = {
  BTC: "BTC-USD",
  BITCOIN: "BTC-USD",
  ETH: "ETH-USD",
  ETHEREUM: "ETH-USD",
  SOL: "SOL-USD",
  SOLANA: "SOL-USD",
  XRP: "XRP-USD",
  DOGE: "DOGE-USD",
  DOGECOIN: "DOGE-USD",
  ADA: "ADA-USD",
  CARDANO: "ADA-USD",
  BNB: "BNB-USD",
  AVAX: "AVAX-USD",
  LINK: "LINK-USD",
  SUI: "SUI-USD",
  PEPE: "PEPE-USD",
  SHIB: "SHIB-USD",
  LTC: "LTC-USD",
  BCH: "BCH-USD",
  DOT: "DOT-USD",
  MATIC: "MATIC-USD",
  POL: "POL-USD"
};

const headers = {
  "access-control-allow-origin": "*",
  "content-type": "application/json",
  "cache-control": "public, max-age=30"
};

const ALPACA_KEY = process.env.ALPACA_API_KEY_ID || process.env.APCA_API_KEY_ID || "";
const ALPACA_SECRET = process.env.ALPACA_API_SECRET_KEY || process.env.APCA_API_SECRET_KEY || "";
const ALPACA_DATA_BASE_URL = (process.env.ALPACA_DATA_BASE_URL || "https://data.alpaca.markets").replace(/\/+$/, "");
const ALPACA_STOCK_FEED = process.env.ALPACA_STOCK_FEED || process.env.ALPACA_DATA_FEED || "iex";
const ALPACA_CRYPTO_LOC = process.env.ALPACA_CRYPTO_LOC || "us";

function normalizeSymbol(input) {
  const clean = String(input || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  return CRYPTO_ALIASES[clean] || clean;
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0 DayTraderOS/1.0"
    }
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "text/plain,*/*",
      "user-agent": "Mozilla/5.0 DayTraderOS/1.0"
    }
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.text();
}

async function getAlpacaJson(url) {
  if (!ALPACA_KEY || !ALPACA_SECRET) throw new Error("Alpaca keys are not configured");
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "APCA-API-KEY-ID": ALPACA_KEY,
      "APCA-API-SECRET-KEY": ALPACA_SECRET
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Alpaca request failed: ${response.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`);
  }
  return response.json();
}

async function resolveSymbol(query) {
  const normalized = normalizeSymbol(query);
  if (!normalized) return "";
  if (normalized.includes("-USD") || normalized.length <= 5) return normalized;

  const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`;
  const data = await getJson(searchUrl);
  const quote = (data.quotes || []).find(item => item.symbol && item.quoteType);
  return quote ? quote.symbol : normalized;
}

function isCryptoSymbol(symbol) {
  const clean = String(symbol || "").toUpperCase();
  return Boolean(CRYPTO_ALIASES[clean] || clean.endsWith("-USD") || clean.endsWith("/USD"));
}

function toAlpacaCryptoSymbol(symbol) {
  const normalized = normalizeSymbol(symbol).replace("-USD", "/USD");
  if (normalized.includes("/")) return normalized;
  return `${normalized}/USD`;
}

function fromAlpacaBars(rows = []) {
  return rows.map(row => ({
    time: row.t || null,
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v)
  })).filter(candle =>
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low)
  );
}

async function fetchAlpacaCandles(symbol) {
  if (!ALPACA_KEY || !ALPACA_SECRET) return null;
  const start = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  if (isCryptoSymbol(symbol)) {
    const alpacaSymbol = toAlpacaCryptoSymbol(symbol);
    const url = `${ALPACA_DATA_BASE_URL}/v1beta3/crypto/${encodeURIComponent(ALPACA_CRYPTO_LOC)}/bars?symbols=${encodeURIComponent(alpacaSymbol)}&timeframe=1Hour&start=${encodeURIComponent(start)}&limit=180&sort=asc`;
    const data = await getAlpacaJson(url);
    const candles = fromAlpacaBars(data?.bars?.[alpacaSymbol] || []);
    return candles.length ? { candles, source: `Alpaca crypto bars (${ALPACA_CRYPTO_LOC})`, endpoint: ALPACA_DATA_BASE_URL } : null;
  }
  const stockSymbol = String(symbol || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  const url = `${ALPACA_DATA_BASE_URL}/v2/stocks/bars?symbols=${encodeURIComponent(stockSymbol)}&timeframe=1Hour&start=${encodeURIComponent(start)}&limit=180&adjustment=raw&feed=${encodeURIComponent(ALPACA_STOCK_FEED)}`;
  const data = await getAlpacaJson(url);
  const candles = fromAlpacaBars(data?.bars?.[stockSymbol] || []);
  return candles.length ? { candles, source: `Alpaca stock bars (${ALPACA_STOCK_FEED})`, endpoint: ALPACA_DATA_BASE_URL } : null;
}

function addScore(parts, points, text) {
  parts.score += points;
  parts.rationale.push(text);
}

function compactProvider(url = "") {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const provider = host.split(".")[0] || "news";
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  } catch (error) {
    return "News";
  }
}

function newsItems(news = []) {
  return news.slice(0, 5).map(item => {
    const url = item.link || item.url || "";
    return {
      title: item.title || "",
      publisher: item.publisher || compactProvider(url),
      url,
      publishedAt: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : null,
      type: item.type || "news"
    };
  }).filter(item => item.title);
}

function buildMarketContext(quote, news = []) {
  const symbol = quote.symbol || "";
  const name = quote.longName || quote.shortName || quote.displayName || symbol;
  const headlines = newsItems(news);
  const groundQuery = `${name} ${symbol} market news`;
  const companyQuery = `${name} ${symbol}`;
  const earningsQuery = `${symbol} earnings calendar`;
  const secQuery = `${symbol} filings`;
  const sectorQuery = `${symbol} sector ETF peers relative strength`;
  const macroQuery = `${symbol} macro rates dollar yields market impact`;

  return {
    summary: [
      headlines.length
        ? `Fresh headline stack found ${headlines.length} Yahoo Finance-linked item${headlines.length === 1 ? "" : "s"} for ${symbol}.`
        : `No fresh Yahoo Finance headlines returned for ${symbol}; use the linked checks before treating the setup as confirmed.`,
      `Market state: ${quote.marketState || "unknown"}; exchange/source: ${quote.fullExchangeName || quote.exchange || "market feed"}.`,
      "Confirm whether today's move is company-specific, sector-driven, macro-driven, or crypto-liquidity driven before sizing risk."
    ],
    feeds: {
      headlines,
      earnings: {
        label: "Earnings calendar",
        query: earningsQuery,
        url: `https://finance.yahoo.com/calendar/earnings?symbol=${encodeURIComponent(symbol)}`
      },
      sec: {
        label: "SEC/company releases",
        query: secQuery,
        url: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(symbol)}`
      },
      macro: {
        label: "Macro calendar",
        query: macroQuery,
        url: "https://www.marketwatch.com/economy-politics/calendar"
      },
      sector: {
        label: "Sector / beta check",
        query: sectorQuery,
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/comparison/`
      },
      groundNews: {
        label: "Ground News source balance",
        query: groundQuery,
        url: `https://ground.news/search?q=${encodeURIComponent(groundQuery)}`
      },
      cnbc: {
        label: "CNBC ticker/news search",
        query: companyQuery,
        url: `https://www.cnbc.com/search/?query=${encodeURIComponent(companyQuery)}`
      },
      yahoo: {
        label: "Yahoo Finance quote/news",
        query: companyQuery,
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
      }
    }
  };
}

function parseChartCandles(chart) {
  const result = chart?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!quote?.close?.length) return [];
  return quote.close.map((close, index) => ({
    time: result.timestamp?.[index] || null,
    open: Number(quote.open?.[index]),
    high: Number(quote.high?.[index]),
    low: Number(quote.low?.[index]),
    close: Number(close),
    volume: Number(quote.volume?.[index])
  })).filter(candle =>
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low)
  );
}

function parseStooqCandles(csv) {
  const lines = String(csv || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 5 || !/^date,/i.test(lines[0])) return [];
  return lines.slice(1).map(line => {
    const [date, open, high, low, close, volume] = line.split(",");
    return {
      time: Math.floor(new Date(`${date}T16:00:00-05:00`).getTime() / 1000),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume)
    };
  }).filter(candle =>
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low)
  );
}

async function fetchStooqCandles(symbol) {
  if (isCryptoSymbol(symbol)) return null;
  const clean = String(symbol || "").toLowerCase().replace(/[^a-z0-9.-]/g, "");
  if (!clean) return null;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(clean)}.us&i=d`;
  const candles = parseStooqCandles(await getText(url)).slice(-180);
  return candles.length ? {
    candles,
    source: "Stooq delayed daily candles",
    delayed: true
  } : null;
}

function quoteFromCandles(symbol, candleData) {
  const candles = candleData?.candles || [];
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const price = Number(last?.close);
  const prior = Number(previous?.close);
  const changePercent = Number.isFinite(price) && Number.isFinite(prior) && prior
    ? ((price - prior) / prior) * 100
    : 0;
  const highs = candles.map(candle => Number(candle.high)).filter(Number.isFinite);
  const lows = candles.map(candle => Number(candle.low)).filter(Number.isFinite);
  return {
    symbol,
    shortName: symbol,
    longName: `${symbol} market data`,
    regularMarketPrice: price,
    regularMarketChangePercent: changePercent,
    regularMarketVolume: Number(last?.volume || 0),
    averageDailyVolume3Month: candles.length
      ? candles.reduce((sum, candle) => sum + Number(candle.volume || 0), 0) / candles.length
      : 0,
    regularMarketDayHigh: Number(last?.high),
    regularMarketDayLow: Number(last?.low),
    regularMarketPreviousClose: prior,
    fiftyTwoWeekHigh: highs.length ? Math.max(...highs) : 0,
    fiftyTwoWeekLow: lows.length ? Math.min(...lows) : 0,
    marketState: candleData?.delayed ? "DELAYED" : "LIVE",
    fullExchangeName: isCryptoSymbol(symbol) ? "Crypto" : "US Equity"
  };
}

function buildSignal(quote, chart, news) {
  const price = Number(quote.regularMarketPrice || quote.postMarketPrice || quote.preMarketPrice || quote.bid);
  const changePercent = Number(quote.regularMarketChangePercent || quote.postMarketChangePercent || quote.preMarketChangePercent || 0);
  const volume = Number(quote.regularMarketVolume || 0);
  const avgVolume = Number(quote.averageDailyVolume3Month || quote.averageDailyVolume10Day || 0);
  const high52 = Number(quote.fiftyTwoWeekHigh || 0);
  const low52 = Number(quote.fiftyTwoWeekLow || 0);
  const dayHigh = Number(quote.regularMarketDayHigh || 0);
  const dayLow = Number(quote.regularMarketDayLow || 0);
  const previousClose = Number(quote.regularMarketPreviousClose || 0);
  const parts = { score: 50, rationale: [] };

  if (changePercent >= 2) addScore(parts, 13, "Strong positive intraday momentum.");
  else if (changePercent >= 0.5) addScore(parts, 7, "Price is holding positive momentum.");
  else if (changePercent <= -2) addScore(parts, -13, "Sharp negative intraday momentum.");
  else if (changePercent <= -0.5) addScore(parts, -7, "Price is trading with negative momentum.");
  else parts.rationale.push("Price change is muted, so the signal leans more on context than momentum.");

  if (avgVolume && volume) {
    const relVolume = volume / avgVolume;
    if (relVolume >= 1.5) addScore(parts, 8, "Volume is meaningfully above its recent average.");
    else if (relVolume <= 0.45) addScore(parts, -5, "Volume is light compared with its recent average.");
    else parts.rationale.push("Volume is near normal range.");
  }

  if (high52 && low52 && price) {
    const rangePos = (price - low52) / Math.max(high52 - low52, 1);
    if (rangePos >= 0.82) addScore(parts, 6, "Price is near the upper end of its 52-week range.");
    else if (rangePos <= 0.18) addScore(parts, -6, "Price is near the lower end of its 52-week range.");
  }

  if (dayHigh && dayLow && price) {
    const intradayPos = (price - dayLow) / Math.max(dayHigh - dayLow, 0.01);
    if (intradayPos >= 0.72) addScore(parts, 5, "Current price is near the high of the session.");
    else if (intradayPos <= 0.28) addScore(parts, -5, "Current price is near the low of the session.");
  }

  const closes = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Number.isFinite) || [];
  if (closes.length >= 8) {
    const recent = closes.slice(-1)[0];
    const prior = closes.slice(-8)[0];
    const move = ((recent - prior) / prior) * 100;
    if (move >= 1.5) addScore(parts, 6, "Recent chart slope is positive.");
    else if (move <= -1.5) addScore(parts, -6, "Recent chart slope is negative.");
  }

  if (previousClose && price && price > previousClose) {
    parts.rationale.push("Price is above the previous close.");
  } else if (previousClose && price && price < previousClose) {
    parts.rationale.push("Price is below the previous close.");
  }

  const confidence = Math.max(5, Math.min(95, Math.round(parts.score)));
  const rating = confidence >= 63 ? "BUY" : confidence <= 38 ? "SELL" : "HOLD";
  const context = buildMarketContext(quote, news);
  const headlines = context.feeds.headlines.map(item => `${item.publisher}: ${item.title}`);
  const groundQuery = `${quote.longName || quote.shortName || quote.symbol} ${quote.symbol} market news`;
  const candles = parseChartCandles(chart);

  return {
    symbol: quote.symbol,
    name: quote.longName || quote.shortName || quote.displayName || quote.symbol,
    rating,
    confidence,
    price: Number.isFinite(price) ? price.toFixed(price > 1000 ? 2 : 4).replace(/\.?0+$/, "") : null,
    changePercent: Number.isFinite(changePercent) ? changePercent : null,
    volume: Number.isFinite(volume) ? volume : null,
    marketState: quote.marketState || null,
    exchange: quote.fullExchangeName || quote.exchange || null,
    rationale: parts.rationale.slice(0, 5),
    news: headlines.length ? headlines : context.summary,
    marketContext: context,
    groundNews: {
      provider: "Ground News",
      query: groundQuery,
      url: context.feeds.groundNews.url,
      note: "Use Ground News search for center-weighted coverage and bias comparison. Ground News does not provide a public API for embedding center-only results directly."
    },
    candles,
    candleSource: candles.length ? "Vercel Yahoo candle proxy" : null,
    feedDelayed: false,
    source: "Yahoo Finance public quote/news feeds",
    asOf: new Date().toISOString()
  };
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    const requested = event.queryStringParameters?.symbol;
    const symbol = await resolveSymbol(requested);
    if (!symbol) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing symbol" })
      };
    }

    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=30m`;
    const newsUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=5`;

    const [quoteData, chartData, newsData, alpacaData, stooqData] = await Promise.all([
      getJson(quoteUrl).catch(() => null),
      getJson(chartUrl).catch(() => null),
      getJson(newsUrl).catch(() => ({ news: [] })),
      fetchAlpacaCandles(symbol).catch(() => null),
      fetchStooqCandles(symbol).catch(() => null)
    ]);

    const yahooCandles = parseChartCandles(chartData);
    const candleData = alpacaData?.candles?.length
      ? alpacaData
      : yahooCandles.length
        ? { candles: yahooCandles, source: "Vercel Yahoo candle proxy", delayed: false }
        : stooqData?.candles?.length
          ? stooqData
          : null;

    const quote = quoteData?.quoteResponse?.result?.[0] || (candleData ? quoteFromCandles(symbol, candleData) : null);
    if (!quote) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Symbol not found", symbol })
      };
    }

    const signal = buildSignal(quote, chartData, newsData.news || []);
    if (candleData?.candles?.length) {
      signal.candles = candleData.candles;
      signal.candleSource = candleData.source;
      signal.feedDelayed = Boolean(candleData.delayed);
      signal.source = `${signal.source} + ${candleData.source}`;
      if (candleData.endpoint) signal.alpacaEndpoint = candleData.endpoint;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(signal)
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: "Live analysis temporarily unavailable",
        detail: error.message
      })
    };
  }
};
