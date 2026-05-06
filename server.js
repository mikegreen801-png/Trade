require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const { WebSocket: NodeWS, WebSocketServer } = require("ws");

const app = express();
const port = Number(process.env.PORT || 3000);
const root = __dirname;

function chooseWebRoot() {
  const extractedRoot = path.join(root, "extracted-files");
  const extractedIndex = path.join(extractedRoot, "index.html");
  const rootIndex = path.join(root, "index.html");

  if (fs.existsSync(extractedIndex)) {
    return { webRoot: extractedRoot, source: "extracted-files" };
  }
  if (fs.existsSync(rootIndex)) {
    return { webRoot: root, source: "repo-root" };
  }

  const checked = [extractedIndex, rootIndex];
  const error = new Error(`No index.html found. Checked: ${checked.join(" | ")}`);
  error.code = "NO_INDEX_FOUND";
  throw error;
}

let selected;
try {
  selected = chooseWebRoot();
} catch (error) {
  console.error("[DayTraderOS] Startup root detection failed:", error.message);
  process.exit(1);
}

const webRoot = selected.webRoot;
const startupIndex = path.join(webRoot, "index.html");
const startupApiDir = path.join(webRoot, "api");

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Static assets and pages
app.use(express.static(webRoot, { extensions: ["html"] }));

// Keep Netlify-style function paths working by forwarding to Vercel-style API files
app.use("/.netlify/functions/:name", async (req, res, next) => {
  try {
    req.url = `/api/${req.params.name}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;
    next();
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Rewrite failed" });
  }
});

// ── Python Trading Engine Proxy ──
const http = require("http");
const _botUrl = new URL((process.env.PYTHON_BOT_URL || "http://localhost:8000").replace(/\/$/, ""));
const BOT_HOSTNAME = _botUrl.hostname;
const BOT_PORT = Number(_botUrl.port) || 8000;
const BOT_HOST = _botUrl.host;

app.all("/api/bot/*", (req, res) => {
  const target = new URL(req.url, "http://localhost");
  const options = {
    hostname: BOT_HOSTNAME,
    port: BOT_PORT,
    path: target.pathname + target.search,
    method: req.method,
    headers: { ...req.headers, host: BOT_HOST },
  };

  const proxy = http.request(options, (pythonRes) => {
    res.status(pythonRes.statusCode);
    Object.entries(pythonRes.headers).forEach(([k, v]) => {
      if (!["transfer-encoding", "connection"].includes(k.toLowerCase())) res.setHeader(k, v);
    });
    pythonRes.pipe(res, { end: true });
  });

  proxy.on("error", (err) => {
    console.error("[DayTraderOS] Python bot proxy error:", err.message);
    res.status(502).json({ ok: false, error: "Trading engine unavailable", detail: err.message });
  });

  if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
    proxy.write(JSON.stringify(req.body));
  }
  proxy.end();
});

// Minimal API bridge that executes extracted-files/api/*.js handlers
app.all("/api/:name", async (req, res, next) => {
  if (req.params.name === "alerts") return next(); // Handled below
  try {
    const apiPath = path.join(webRoot, "api", `${req.params.name}.js`);
    delete require.cache[require.resolve(apiPath)];
    const handler = require(apiPath);
    if (typeof handler !== "function") {
      return res.status(500).json({ ok: false, error: `Invalid API handler: ${req.params.name}` });
    }
    return handler(req, res);
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: `API route not found: ${req.params.name}` });
    }
    return res.status(500).json({ ok: false, error: error.message || "API error" });
  }
});

// ── Alert System SSE & State ──
let activeAlerts = {}; // { symbol: [ {id, price, direction, message} ] }
let sseClients = new Set();

app.post("/api/alerts", (req, res) => {
  const alerts = req.body.alerts || [];
  activeAlerts = {};
  alerts.forEach(a => {
    if (!a.symbol || !a.price) return;
    if (!activeAlerts[a.symbol]) activeAlerts[a.symbol] = [];
    activeAlerts[a.symbol].push(a);
  });
  res.json({ ok: true, count: alerts.length });
});

app.get("/api/alerts/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// Poll prices every 30s and check alerts
setInterval(async () => {
  if (sseClients.size === 0) return;
  const symbols = Object.keys(activeAlerts);
  if (!symbols.length) return;

  for (const sym of symbols) {
    try {
      const candlesMod = require(path.join(webRoot, "api", "candles.js"));
      // We simulate a req/res to call the candles handler directly
      let candleData = null;
      await candlesMod(
        { query: { symbol: sym, limit: 1 } },
        { json: (data) => { candleData = data; }, status: () => ({ json: () => {} }) }
      );
      
      if (candleData && candleData.candles && candleData.candles.length) {
        const currentPrice = candleData.candles[0].close;
        const matchedAlerts = activeAlerts[sym].filter(a => {
          if (a.direction === "above" && currentPrice >= a.price) return true;
          if (a.direction === "below" && currentPrice <= a.price) return true;
          return false;
        });

        if (matchedAlerts.length > 0) {
          const payload = JSON.stringify({ symbol: sym, price: currentPrice, alerts: matchedAlerts });
          sseClients.forEach(client => client.write(`data: ${payload}\n\n`));
        }
      }
    } catch (e) {
      // Ignore poll errors
    }
  }
}, 30000);

// Friendly routes without .html
app.get("/:page", (req, res, next) => {
  if (req.params.page.includes(".")) return next();
  const target = path.join(webRoot, `${req.params.page}.html`);
  res.sendFile(target, err => {
    if (err) next();
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

// ── HTTP server shared by Express + WebSocket ──
const server = http.createServer(app);

// ── Stock price WebSocket proxy ──
const wss = new WebSocketServer({ server });

let alpacaWs = null;
const stockSubs = new Map();  // symbol -> Set<browser ws>
const clientSubs = new Map(); // browser ws -> Set<symbol>

function ensureAlpacaConnection() {
  if (alpacaWs && alpacaWs.readyState === NodeWS.OPEN) return;
  const key = process.env.ALPACA_PAPER_API_KEY_ID || process.env.ALPACA_API_KEY_ID || "";
  const secret = process.env.ALPACA_PAPER_API_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "";
  if (!key || !secret) {
    console.warn("[DayTraderOS] No Alpaca keys — stock WebSocket proxy disabled");
    return;
  }
  alpacaWs = new NodeWS("wss://stream.data.alpaca.markets/v2/iex");
  alpacaWs.on("open", () => {
    alpacaWs.send(JSON.stringify({ action: "auth", key, secret }));
  });
  alpacaWs.on("message", (raw) => {
    let msgs;
    try { msgs = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(msgs)) msgs = [msgs];
    for (const msg of msgs) {
      if (msg.T === "success" && msg.msg === "authenticated") {
        const all = [...stockSubs.keys()];
        if (all.length) alpacaWs.send(JSON.stringify({ action: "subscribe", quotes: all }));
      }
      if (msg.T === "q" && msg.S && msg.ap != null) {
        const payload = JSON.stringify({ symbol: msg.S, price: msg.ap, type: "stock" });
        (stockSubs.get(msg.S) || []).forEach(c => {
          if (c.readyState === NodeWS.OPEN) c.send(payload);
        });
      }
    }
  });
  alpacaWs.on("close", () => { alpacaWs = null; });
  alpacaWs.on("error", (err) => console.error("[DayTraderOS] Alpaca WSS error:", err.message));
}

wss.on("connection", (ws) => {
  clientSubs.set(ws, new Set());
  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.action === "subscribe" && Array.isArray(msg.symbols)) {
      const newSyms = [];
      for (const s of msg.symbols) {
        const sym = String(s).toUpperCase();
        if (!stockSubs.has(sym)) { stockSubs.set(sym, new Set()); newSyms.push(sym); }
        stockSubs.get(sym).add(ws);
        clientSubs.get(ws).add(sym);
      }
      if (newSyms.length) {
        ensureAlpacaConnection();
        if (alpacaWs && alpacaWs.readyState === NodeWS.OPEN)
          alpacaWs.send(JSON.stringify({ action: "subscribe", quotes: newSyms }));
      }
    }
    if (msg.action === "unsubscribe" && Array.isArray(msg.symbols)) {
      const drop = [];
      for (const s of msg.symbols) {
        const sym = String(s).toUpperCase();
        stockSubs.get(sym)?.delete(ws);
        clientSubs.get(ws)?.delete(sym);
        if (!stockSubs.get(sym)?.size) { stockSubs.delete(sym); drop.push(sym); }
      }
      if (drop.length && alpacaWs?.readyState === NodeWS.OPEN)
        alpacaWs.send(JSON.stringify({ action: "unsubscribe", quotes: drop }));
    }
  });
  ws.on("close", () => {
    const mySyms = clientSubs.get(ws) || new Set();
    const drop = [];
    for (const sym of mySyms) {
      stockSubs.get(sym)?.delete(ws);
      if (!stockSubs.get(sym)?.size) { stockSubs.delete(sym); drop.push(sym); }
    }
    clientSubs.delete(ws);
    if (drop.length && alpacaWs?.readyState === NodeWS.OPEN)
      alpacaWs.send(JSON.stringify({ action: "unsubscribe", quotes: drop }));
  });
});

server.listen(port, () => {
  console.log(`[DayTraderOS] Web service running on port ${port}`);
  console.log(`[DayTraderOS] webRoot source: ${selected.source}`);
  console.log(`[DayTraderOS] webRoot path: ${webRoot}`);
  console.log(`[DayTraderOS] index.html exists: ${fs.existsSync(startupIndex)}`);
  console.log(`[DayTraderOS] api directory exists: ${fs.existsSync(startupApiDir)}`);
});
