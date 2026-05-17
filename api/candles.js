/**
 * Server-Side Candle Proxy - /api/candles
 * Fetches candle data server-side to eliminate CORS issues.
 * Supports stocks (Yahoo) and crypto (Binance/Coinbase).
 *
 * Usage: GET /api/candles?symbol=AAPL&interval=1h&limit=160
 */

const CRYPTO_MAP = {
  BTC:'BTCUSDT',BITCOIN:'BTCUSDT',ETH:'ETHUSDT',ETHEREUM:'ETHUSDT',
  SOL:'SOLUSDT',SOLANA:'SOLUSDT',DOGE:'DOGEUSDT',DOGECOIN:'DOGEUSDT',
  XRP:'XRPUSDT',ADA:'ADAUSDT',BNB:'BNBUSDT',AVAX:'AVAXUSDT',
  LINK:'LINKUSDT',LTC:'LTCUSDT',BCH:'BCHUSDT',DOT:'DOTUSDT',
  MATIC:'MATICUSDT',POL:'POLUSDT',UNI:'UNIUSDT',AAVE:'AAVEUSDT',
  ATOM:'ATOMUSDT',NEAR:'NEARUSDT',OP:'OPUSDT',ARB:'ARBUSDT',
  FIL:'FILUSDT',SUI:'SUIUSDT',APT:'APTUSDT',PEPE:'PEPEUSDT',
  SHIB:'SHIBUSDT',BONK:'BONKUSDT',FET:'FETUSDT',RENDER:'RENDERUSDT',
  TAO:'TAOUSDT',HBAR:'HBARUSDT',ICP:'ICPUSDT',INJ:'INJUSDT',
  WIF:'WIFUSDT',TRX:'TRXUSDT',XLM:'XLMUSDT',ETC:'ETCUSDT'
};

function cleanSymbol(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '') || 'AAPL';
}

function cryptoPair(sym) {
  const clean = cleanSymbol(sym);
  if (CRYPTO_MAP[clean]) return CRYPTO_MAP[clean];
  if (/^[A-Z0-9]{2,12}USDT$/.test(clean)) return clean;
  return null;
}

function cryptoBase(sym) {
  const pair = cryptoPair(sym);
  return pair ? pair.replace(/USDT$/, '') : null;
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'accept': 'application/json', 'user-agent': 'DayTraderOS/1.0' }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'accept': 'text/plain,*/*', 'user-agent': 'DayTraderOS/1.0' }
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

// ── Crypto candles from Binance ──
async function fetchCryptoCandles(sym, interval, limit) {
  const pair = cryptoPair(sym);
  if (!pair) return null;

  const binanceUrls = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
  ];

  for (const url of binanceUrls) {
    try {
      const rows = await fetchJSON(url);
      const candles = rows.map(r => ({
        time: Math.floor(r[0] / 1000),
        open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5]
      })).filter(c => Number.isFinite(c.close));
      if (candles.length) return { candles, source: 'Binance', delayed: false };
    } catch (e) { /* try next */ }
  }

  // Coinbase fallback
  const base = cryptoBase(sym);
  if (base) {
    try {
      const granMap = { '15m': 900, '1h': 3600, '4h': 21600, '1d': 86400 };
      const rows = await fetchJSON(
        `https://api.exchange.coinbase.com/products/${base}-USD/candles?granularity=${granMap[interval] || 3600}`
      );
      const candles = rows
        .map(r => ({ time: r[0], open: +r[3], high: +r[2], low: +r[1], close: +r[4], volume: +r[5] }))
        .filter(c => Number.isFinite(c.close))
        .sort((a, b) => a.time - b.time)
        .slice(-limit);
      if (candles.length) return { candles, source: 'Coinbase', delayed: false };
    } catch (e) { /* fall through */ }
  }

  return null;
}

// ── Stock candles from Yahoo ──
async function fetchYahooCandles(sym, interval, limit) {
  const rangeMap = { '15m': '5d', '1h': '1mo', '4h': '3mo', '1d': '6mo' };
  const yahooInterval = interval === '4h' ? '1h' : interval;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${rangeMap[interval] || '1mo'}&interval=${yahooInterval}&includePrePost=true`;

  try {
    const data = await fetchJSON(url);
    const result = data.chart?.result?.[0];
    const q = result?.indicators?.quote?.[0];
    if (!q?.close?.length) return null;

    let candles = q.close.map((close, i) => ({
      time: result.timestamp?.[i] || 0,
      open: +q.open?.[i], high: +q.high?.[i], low: +q.low?.[i],
      close: +close, volume: +q.volume?.[i]
    })).filter(c => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low));

    // Aggregate to 4h if needed
    if (interval === '4h') {
      const agg = [];
      for (let i = 0; i < candles.length; i += 4) {
        const group = candles.slice(i, i + 4).filter(c => Number.isFinite(c.close));
        if (group.length < 2) continue;
        agg.push({
          time: group[0].time,
          open: group[0].open,
          high: Math.max(...group.map(c => c.high)),
          low: Math.min(...group.map(c => c.low)),
          close: group[group.length - 1].close,
          volume: group.reduce((s, c) => s + (c.volume || 0), 0)
        });
      }
      candles = agg;
    }

    return candles.length ? { candles: candles.slice(-limit), source: 'Yahoo Finance', delayed: false } : null;
  } catch (e) {
    return null;
  }
}

// ── Stooq daily fallback ──
async function fetchStooqCandles(sym) {
  if (cryptoPair(sym)) return null;
  const clean = sym.toLowerCase().replace(/[^a-z0-9.-]/g, '');
  if (!clean) return null;

  try {
    const csv = await fetchText(`https://stooq.com/q/d/l/?s=${encodeURIComponent(clean + '.us')}&i=d`);
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 10 || !/^date,/i.test(lines[0])) return null;

    const candles = lines.slice(1).map(line => {
      const [date, open, high, low, close, volume] = line.split(',');
      return {
        time: Math.floor(new Date(`${date}T16:00:00-05:00`).getTime() / 1000),
        open: +open, high: +high, low: +low, close: +close, volume: +volume
      };
    }).filter(c => Number.isFinite(c.close) && Number.isFinite(c.high)).slice(-180);

    return candles.length ? { candles, source: 'Stooq daily', delayed: true } : null;
  } catch (e) {
    return null;
  }
}

const cache = require('./cache');

module.exports = async function handler(req, res) {
  const sym = cleanSymbol(req.query?.symbol);
  const interval = req.query?.interval || '1h';
  const limit = Math.min(parseInt(req.query?.limit) || 160, 500);

  const cacheKey = `candles:${sym}:${interval}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Try sources in priority order
    let result = null;

    // 1. Crypto (Binance/Coinbase)
    if (cryptoPair(sym)) {
      result = await fetchCryptoCandles(sym, interval, limit);
    }

    // 2. Yahoo Finance (stocks)
    if (!result) {
      result = await fetchYahooCandles(sym, interval, limit);
    }

    // 3. Stooq daily fallback (stocks only)
    if (!result && interval === '1d') {
      result = await fetchStooqCandles(sym);
    }
    if (!result) {
      result = await fetchStooqCandles(sym);
    }

    if (!result || !result.candles?.length) {
      return res.status(404).json({
        ok: false,
        error: `No candle data found for ${sym}`,
        symbol: sym
      });
    }

    const payload = {
      ok: true,
      symbol: sym,
      interval,
      candles: result.candles,
      source: result.source,
      delayed: result.delayed,
      count: result.candles.length
    };
    cache.set(cacheKey, payload, 60_000);
    return res.json(payload);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error.message || 'Candle proxy error',
      symbol: sym
    });
  }
};
