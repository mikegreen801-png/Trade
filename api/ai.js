/**
 * AI Trade Assistant — POST /api/ai
 * Auto-selects provider from env vars:
 *   GROQ_API_KEY      → Groq (free tier at console.groq.com)
 *   ANTHROPIC_API_KEY → Anthropic (claude-haiku)
 *   OLLAMA_URL        → Ollama local (free, default http://localhost:11434)
 *   OLLAMA_MODEL      → model name override (default llama3.2)
 */

const cache = require('./cache');

function getProvider() {
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) return 'ollama';
  return null;
}

async function callGroq(prompt) {
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Groq ' + res.status + ': ' + text.slice(0, 200));
  }
  const data = await res.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(prompt) {
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) {
    throw new Error('@anthropic-ai/sdk not installed. Run: npm install @anthropic-ai/sdk');
  }
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  });
  return msg.content[0]?.text || '';
}

async function callOllama(prompt) {
  const base = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const res = await fetch(base + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 300, temperature: 0.3 } })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Ollama ' + res.status + ': ' + text.slice(0, 200));
  }
  const data = await res.json();
  return data.response || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required' });

  const provider = getProvider();
  if (!provider) {
    return res.status(503).json({
      ok: false,
      error: 'No AI provider configured. Add GROQ_API_KEY (free at console.groq.com), ANTHROPIC_API_KEY, or set OLLAMA_URL for a local model.'
    });
  }

  const { symbol, rating, confidence, metrics, rationale, news } = req.body || {};
  if (!symbol) return res.status(400).json({ ok: false, error: 'Missing symbol' });

  const cacheKey = `ai:${provider}:${symbol}:${rating}:${Math.floor(Date.now() / 300000)}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const keySignals = (rationale || []).slice(0, 4).map(r => '• ' + r).join('\n');
  const newsContext = news && news.length ? '\nRecent context:\n' + news.slice(0, 2).join('\n') : '';

  const prompt = `You are a concise professional trading analyst. Write a 2-3 sentence thesis for ${symbol}.

Technical read: ${rating} (${confidence}% confidence)
Price: ${metrics?.price}  Support/Resistance: ${metrics?.support} → ${metrics?.resistance}
Stop/Target: ${metrics?.stop} / ${metrics?.target}  R:R: ${metrics?.rr}  RSI: ${metrics?.rsi}  Volume: ${metrics?.volume}

Key signals:
${keySignals}${newsContext}

Rules: Lead with the primary driver. Name one specific level to watch. End with the invalidation. Plain English, no bullets, no repeating raw numbers verbatim.`;

  try {
    let thesis = '';
    if (provider === 'groq') thesis = await callGroq(prompt);
    else if (provider === 'anthropic') thesis = await callAnthropic(prompt);
    else if (provider === 'ollama') thesis = await callOllama(prompt);

    thesis = thesis.trim();
    const payload = { ok: true, symbol, thesis, provider };
    cache.set(cacheKey, payload, 300_000);
    return res.json(payload);
  } catch (err) {
    console.error('[API/ai]', provider, err.message);
    return res.status(500).json({ ok: false, error: err.message, provider });
  }
};
