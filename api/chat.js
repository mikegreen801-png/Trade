/**
 * AI Chat Assistant — POST /api/chat
 * Multi-turn chat using the same provider detection as /api/ai.
 * Body: { messages: [{role, content}], context: { page, symbol, ... } }
 */

function getProvider() {
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) return 'ollama';
  return null;
}

function buildSystemPrompt(context) {
  let base = 'You are an AI trading assistant embedded in Day Trader OS. ' +
    'Help traders think through setups, risk/reward, entries, and market conditions. ' +
    'Be concise (2-4 sentences unless detail is needed). Be specific and actionable. ' +
    'Do not give financial advice — frame everything as analysis and education.';
  if (context && Object.keys(context).length) {
    const parts = [];
    if (context.page)   parts.push('page: ' + context.page);
    if (context.symbol) parts.push('symbol: ' + context.symbol);
    if (context.rating) parts.push('rating: ' + context.rating);
    if (context.price)  parts.push('price: ' + context.price);
    if (context.side)   parts.push('side: ' + context.side);
    if (context.entry)  parts.push('entry: ' + context.entry);
    if (context.stop)   parts.push('stop: ' + context.stop);
    if (context.target) parts.push('target: ' + context.target);
    if (parts.length) base += '\n\nActive context — ' + parts.join(', ') + '.';
  }
  return base;
}

async function callGroq(systemPrompt, messages) {
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 400,
      temperature: 0.5
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Groq ' + res.status + ': ' + text.slice(0, 200));
  }
  const data = await res.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(systemPrompt, messages) {
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) {
    throw new Error('@anthropic-ai/sdk not installed.');
  }
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: systemPrompt,
    messages
  });
  return msg.content[0]?.text || '';
}

async function callOllama(systemPrompt, messages) {
  const base = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  // Convert messages array to a single prompt string for Ollama
  const history = messages.map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content).join('\n');
  const prompt = systemPrompt + '\n\n' + history + '\nAssistant:';
  const res = await fetch(base + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 400, temperature: 0.5 } })
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

  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: 'messages array required' });
  }

  // Keep last 20 turns to stay within token limits
  const recent = messages.slice(-20);
  const systemPrompt = buildSystemPrompt(context);

  try {
    let reply = '';
    if (provider === 'groq')      reply = await callGroq(systemPrompt, recent);
    else if (provider === 'anthropic') reply = await callAnthropic(systemPrompt, recent);
    else if (provider === 'ollama')    reply = await callOllama(systemPrompt, recent);

    return res.json({ ok: true, reply: reply.trim(), provider });
  } catch (err) {
    console.error('[API/chat]', provider, err.message);
    return res.status(500).json({ ok: false, error: err.message, provider });
  }
};
