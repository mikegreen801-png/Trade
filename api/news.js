/**
 * News API Handler — /api/news?symbol=AAPL&limit=8
 * Fetches real headlines from Alpaca News (v1beta1).
 * Falls back gracefully when Alpaca keys are not configured.
 */

const AlpacaClient = require('./alpaca-client');
const cache = require('./cache');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=120'); // Cache 2 minutes

  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const limit  = Math.min(20, Math.max(1, parseInt(req.query.limit) || 8));

  if (!symbol) {
    return res.status(400).json({ ok: false, error: 'Missing ?symbol= query parameter' });
  }

  // Check keys exist before attempting connection
  if (!process.env.ALPACA_API_KEY_ID || !process.env.ALPACA_API_SECRET_KEY) {
    return res.status(200).json({
      ok: false,
      fallback: true,
      symbol,
      articles: [],
      message: 'Alpaca keys not configured — add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY to use live news.'
    });
  }

  const cacheKey = `news:${symbol}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const client = new AlpacaClient();
    const data   = await client.getNews(symbol, limit);

    const articles = (data.news || []).map(article => ({
      id:        article.id,
      headline:  article.headline,
      summary:   article.summary || '',
      url:       article.url || '',
      source:    article.source || 'Alpaca News',
      author:    article.author || '',
      createdAt: article.created_at || article.updated_at || null,
      symbols:   article.symbols || [symbol],
      images:    (article.images || []).slice(0, 1)
    }));

    const payload = { ok: true, symbol, articles };
    cache.set(cacheKey, payload, 120_000);
    return res.json(payload);
  } catch (err) {
    console.error('[API/news] Error:', err?.error || err.message);
    return res.status(200).json({
      ok: false,
      fallback: true,
      symbol,
      articles: [],
      message: `News fetch failed: ${err?.error?.message || err.message || 'Unknown error'}`
    });
  }
};
