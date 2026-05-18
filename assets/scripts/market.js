/* market.js — Market hub page runtime */
(function () {
  "use strict";
  var D = window.DTO, S = window.Site;
  var currentResult = null;

  function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }

  // ── Analyze ──
  var form = document.getElementById("marketAnalyzeForm");
  var input = document.getElementById("marketSymbolInput");
  if (form) form.addEventListener("submit", function (e) { e.preventDefault(); var s = (input.value || "").trim(); if (s) analyze(s); });

  var urlParams = new URLSearchParams(location.search);
  if (urlParams.get("symbol")) { if (input) input.value = urlParams.get("symbol"); analyze(urlParams.get("symbol")); }

  function analyze(raw) {
    var sym = D.cleanSymbol(raw);
    var card = document.getElementById("marketAnalysisCard");
    var ctx = document.getElementById("marketContextCard");
    card.className = "loading-state"; card.textContent = "Analyzing " + sym + "…";
    renderContext(ctx, { marketContext: D.marketContextForSymbol(sym, []) }, true);

    D.fetchCandles(sym).then(function (candles) {
      var r = D.analyzeCandles(sym, candles); currentResult = r;
      S.saveSetup({ symbol: r.symbol, rating: r.rating, confidence: r.confidence, price: r.raw.price, entry: r.raw.price, stop: r.raw.stop, target: r.raw.target, support: r.raw.support, resistance: r.raw.resistance, rr: r.raw.rr, side: r.rating === "SELL" ? "short" : "long", thesis: r.rationale[0] || "" });
      renderAnalysis(card, r);

      var chartWrap = document.getElementById("marketChartContainer");
      var chartBox = document.getElementById("marketChart");
      if (chartWrap && chartBox) {
        chartWrap.style.display = "";
        chartBox.className = "chart-container";
        chartBox.innerHTML = '<iframe src="' + D.tradingViewEmbedUrl(sym) + '" allowfullscreen loading="lazy"></iframe>';
      }

      // Live price stream
      D.stopStream();
      var priceEl = card.querySelector(".metric-card strong");
      var lastPrice = r.raw.price;
      function onTick(p) {
        if (!priceEl || p === lastPrice) return;
        priceEl.textContent = D.fmtPrice(p);
        priceEl.className = p > lastPrice ? "price-tick-up" : "price-tick-down";
        lastPrice = p;
        S.checkAlerts(sym, p);
      }
      if (D.isCryptoSymbol(sym)) D.streamCryptoPrice(sym, onTick);
      else D.streamStockPrice(sym, onTick);

      renderMultiTimeframe(sym);
      fetchAiTake(r);
    }).catch(function (err) { card.className = "empty-state"; card.textContent = "Error: " + err.message; ctx.className = "empty-state"; ctx.textContent = "Context unavailable."; });

    D.fetchNews(sym).then(function (articles) {
      var mapped = articles.map(function (a) { return { title: a.headline, publisher: a.source, url: a.url, sentiment: a.sentiment }; });
      renderContext(ctx, { marketContext: D.marketContextForSymbol(sym, mapped), articles: mapped });
    }).catch(function () {});
  }

  // ── Sentiment helpers ──
  var _bullWords = ['surge', 'rally', 'beat', 'growth', 'bull', 'outperform', 'upgrade', 'buy', 'positive', 'gains', 'record', 'strong', 'boost', 'soar', 'jump', 'high', 'breakout', 'momentum'];
  var _bearWords = ['fall', 'drop', 'miss', 'concern', 'bear', 'downgrade', 'sell', 'negative', 'loss', 'decline', 'cut', 'weak', 'crash', 'plunge', 'slump', 'low', 'breakdown', 'risk'];

  function _sentimentScore(text) {
    var t = (text || '').toLowerCase();
    var s = 0;
    _bullWords.forEach(function (w) { if (t.includes(w)) s++; });
    _bearWords.forEach(function (w) { if (t.includes(w)) s--; });
    return s;
  }

  function _sentimentDot(score) {
    if (score > 0) return '<span class="sentiment-dot bull" title="Bullish tone"></span>';
    if (score < 0) return '<span class="sentiment-dot bear" title="Bearish tone"></span>';
    return '<span class="sentiment-dot neutral" title="Neutral tone"></span>';
  }

  function renderAnalysis(el, r) {
    var rc = r.rating === "BUY" ? "buy" : r.rating === "SELL" ? "sell" : "hold";
    var urls = D.sourceUrls(r.symbol);
    el.className = "analysis-shell";
    el.innerHTML =
      '<div class="analysis-header"><div><h3>' + D.escapeHtml(r.symbol) + '</h3><p style="margin:4px 0 0;color:var(--text-muted);font-size:14px">' + D.escapeHtml(r.name) + '</p></div><span class="analysis-rating mini-chip ' + rc + '">' + r.rating + " " + r.confidence + "%</span></div>" +
      '<div class="analysis-metrics">' + mk("Price", r.metrics.price) + mk("Support", r.metrics.support) + mk("Resistance", r.metrics.resistance) + mk("Stop", r.metrics.stop) + mk("Target", r.metrics.target) + mk("R:R", r.metrics.rr) + mk("RSI", r.metrics.rsi) + mk("Volume", r.metrics.volume) + "</div>" +
      '<div class="analysis-note">' + r.rationale.map(function (l) { return "<p style='margin:6px 0'>" + D.escapeHtml(l) + "</p>"; }).join("") + "</div>" +
      '<div class="source-links">' + sl("TradingView", urls.tradingView) + sl("Yahoo", urls.yahoo) + sl("CNBC", urls.cnbc) + sl("Finviz", urls.finviz) + sl("Ground News", urls.ground) + "</div>";
  }

  function renderContext(el, payload, resetAi) {
    var mc = (payload || {}).marketContext;
    var articles = (payload || {}).articles || [];
    if (!mc) { el.className = "empty-state"; el.textContent = "No context."; return; }
    el.className = "analysis-shell";

    // Preserve the AI Take div across context re-renders (news update)
    var existingAiEl = document.getElementById('marketAiTake');
    var savedAiHtml = (!resetAi && existingAiEl) ? existingAiEl.outerHTML : null;
    var aiPlaceholder = savedAiHtml ||
      '<div id="marketAiTake" class="ai-take ai-take--loading"><span style="color:var(--text-muted);font-size:13px">Generating AI Take…</span></div>';

    var html = "";

    // News mood aggregate
    if (articles.length) {
      var totalSentiment = articles.reduce(function (sum, a) {
        return sum + _sentimentScore(a.title || '');
      }, 0);
      var moodLabel = totalSentiment > 2 ? 'Bullish' : totalSentiment < -2 ? 'Bearish' : 'Neutral';
      var moodClass = totalSentiment > 2 ? 'buy' : totalSentiment < -2 ? 'sell' : 'hold';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
        '<span style="font:500 12px var(--font-mono);color:var(--text-muted)">News Mood</span>' +
        '<span class="mini-chip ' + moodClass + '" style="font-size:11px">' + moodLabel + '</span>' +
        '<span style="font:400 11px var(--font-mono);color:var(--text-muted)">' + articles.length + ' headlines</span>' +
        '</div>';
    }

    var headlines = (mc.feeds.headlines || []);
    if (headlines.length) {
      html += '<div style="display:grid;gap:6px">';
      headlines.forEach(function (h) {
        var score = h.sentiment != null ? h.sentiment : _sentimentScore(h.title || '');
        var dot = _sentimentDot(score);
        var inner = h.url
          ? '<a href="' + D.escapeHtml(h.url) + '" target="_blank" rel="noopener" style="font:600 13px/1.4 var(--font-mono);color:var(--text);text-decoration:none">' + D.escapeHtml(h.title) + '</a>'
          : '<span style="font:600 13px/1.4 var(--font-mono)">' + D.escapeHtml(h.title) + '</span>';
        html += '<div style="padding:8px 12px;border-radius:8px;background:var(--surface-soft);border:1px solid var(--line);border-left:3px solid var(--blue)">' +
          '<div style="display:flex;align-items:flex-start;gap:4px">' + inner + dot + '</div>' +
          '<div style="font:400 11px/1.3 var(--font-mono);color:var(--text-soft);margin-top:3px">' + D.escapeHtml(h.publisher || "") + '</div>' +
          '</div>';
      });
      html += '</div>';
    }

    html += '<div class="analysis-note">' + mc.summary.map(function (l) { return "<p style='margin:6px 0'>" + D.escapeHtml(l) + "</p>"; }).join("") + "</div>";
    html += '<div class="source-links">';
    var feeds = mc.feeds;
    ["yahoo", "cnbc", "earnings", "sec", "macro", "sector", "groundNews"].forEach(function (k) {
      if (feeds[k]) html += sl(feeds[k].label, feeds[k].url);
    });
    html += "</div>";
    el.innerHTML = html + aiPlaceholder;
  }

  // ── AI Take ──
  function fetchAiTake(r) {
    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: r.symbol, rating: r.rating, confidence: r.confidence, metrics: r.metrics, rationale: r.rationale, news: r.news })
    })
    .then(function (res) { return res.json(); })
    .then(function (d) {
      var el = document.getElementById('marketAiTake');
      if (!el) return;
      if (!d.ok) {
        el.className = 'ai-take';
        el.innerHTML = '<details><summary>AI Take <span class="mini-chip hold" style="font-size:11px">unavailable</span></summary>' +
          '<p style="color:var(--text-muted);font-size:13px;margin:8px 0 0">' + D.escapeHtml(d.error || 'No AI provider configured.') + '</p></details>';
        return;
      }
      var providerLabel = d.provider === 'groq' ? 'Groq' : d.provider === 'ollama' ? 'Ollama' : 'Claude';
      el.className = 'ai-take';
      el.innerHTML = '<details open><summary>AI Take <span class="mini-chip buy" style="font-size:11px">' + providerLabel + '</span></summary>' +
        '<p class="ai-take-body">' + D.escapeHtml(d.thesis) + '</p></details>';
    })
    .catch(function () {
      var el = document.getElementById('marketAiTake');
      if (!el) return;
      el.className = 'ai-take';
      el.innerHTML = '<details><summary>AI Take <span class="mini-chip hold" style="font-size:11px">offline</span></summary>' +
        '<p style="color:var(--text-muted);font-size:13px;margin:8px 0 0">AI assistant unavailable.</p></details>';
    });
  }

  function mk(l, v) { return '<div class="metric-card"><span>' + D.escapeHtml(l) + "</span><strong>" + D.escapeHtml(v) + "</strong></div>"; }
  function sl(l, u) { return '<a href="' + D.escapeHtml(u) + '" target="_blank" rel="noopener">' + D.escapeHtml(l) + "</a>"; }

  // ── Add to watchlist ──
  var addBtn = document.getElementById("marketAddWatchlist");
  if (addBtn) addBtn.addEventListener("click", function () {
    if (!currentResult) { S.toast("Analyze a symbol first.", "error"); return; }
    S.addToWatchlist(currentResult.symbol); S.toast(currentResult.symbol + " added.", "success"); renderWatchlist(); updateCounts();
  });

  // ── Market overview benchmarks ──
  var benchmarks = ["SPY", "QQQ", "DIA", "BTC", "ETH"];
  var refreshBtn = document.getElementById("refreshMarketOverview");
  if (refreshBtn) refreshBtn.addEventListener("click", loadOverview);

  function loadOverview() {
    var grid = document.getElementById("marketOverviewGrid");
    grid.className = "benchmark-grid loading-state"; grid.textContent = "Loading benchmarks…";
    Promise.all(benchmarks.map(function (sym) {
      return D.fetchCandles(sym).then(function (candles) {
        return D.analyzeCandles(sym, candles);
      }).catch(function () { return null; });
    })).then(function (results) {
      grid.className = "benchmark-grid";
      grid.innerHTML = results.map(function (r) {
        if (!r) return "";
        var rc = r.rating === "BUY" ? "buy" : r.rating === "SELL" ? "sell" : "hold";
        return '<div class="benchmark-card" data-sym="' + D.escapeHtml(r.symbol) + '" style="cursor:pointer">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
          '<strong style="font-family:var(--font-sans)">' + D.escapeHtml(r.symbol) + '</strong>' +
          '<span class="mini-chip ' + rc + '" style="font-size:11px">' + r.rating + '</span>' +
          '</div>' +
          '<span style="font-family:var(--font-mono)">' + D.escapeHtml(r.metrics.price) + ' · V: ' + D.escapeHtml(r.metrics.volume) + ' · RSI: ' + D.escapeHtml(r.metrics.rsi) + '</span>' +
          '</div>';
      }).join("");
      grid.querySelectorAll("[data-sym]").forEach(function (card) {
        card.addEventListener("click", function () {
          var sym = card.dataset.sym;
          if (input) input.value = sym;
          analyze(sym);
          document.getElementById("marketAnalysisCard").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    });
  }

  // ── Scanner ──
  var scanSymbols = ["AAPL", "NVDA", "TSLA", "MSFT", "AMD", "META", "AMZN", "GOOGL", "BTC", "ETH", "SOL"];
  var scanBtn = document.getElementById("runQuickScan");
  if (scanBtn) scanBtn.addEventListener("click", runScan);

  function runScan() {
    var grid = document.getElementById("scannerGrid");
    grid.className = "scanner-grid loading-state"; grid.textContent = "Scanning…";
    var results = []; var done = 0;
    scanSymbols.forEach(function (sym, i) {
      D.fetchCandles(sym).then(function (c) { results[i] = D.analyzeCandles(sym, c); }).catch(function () { results[i] = null; }).finally(function () {
        done++;
        if (done === scanSymbols.length) {
          grid.className = "scanner-grid";
          grid.innerHTML = results.filter(Boolean).map(function (r) {
            var rc = r.rating === "BUY" ? "buy" : r.rating === "SELL" ? "sell" : "hold";
            return '<div class="scanner-card" data-sym="' + D.escapeHtml(r.symbol) + '" style="cursor:pointer">' +
              '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
              '<strong style="font-family:var(--font-mono)">' + D.escapeHtml(r.symbol) + '</strong>' +
              '<span class="mini-chip ' + rc + '" style="font-size:11px">' + r.rating + ' ' + r.confidence + '%</span>' +
              '</div>' +
              '<span style="font-family:var(--font-mono)">' + D.escapeHtml(r.metrics.price) + ' · V: ' + D.escapeHtml(r.metrics.volume) + ' · R:R: ' + D.escapeHtml(r.metrics.rr) + '</span>' +
              '</div>';
          }).join("");
          grid.querySelectorAll("[data-sym]").forEach(function (card) {
            card.addEventListener("click", function () {
              var sym = card.dataset.sym;
              if (input) input.value = sym;
              analyze(sym);
              document.getElementById("marketAnalysisCard").scrollIntoView({ behavior: "smooth", block: "start" });
            });
          });
        }
      });
    });
  }

  // ── Watchlist ──
  function renderWatchlist() {
    var c = document.getElementById("marketWatchlist"); if (!c) return;
    var list = S.getWatchlist();
    if (!list.length) { c.className = "watchlist-grid empty-state"; c.textContent = "No symbols saved yet."; return; }
    c.className = "watchlist-grid";
    c.innerHTML = list.map(function (sym) {
      return '<div class="watch-card">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<strong style="font-family:var(--font-sans)">' + D.escapeHtml(sym) + '</strong>' +
        '<button class="ghost-btn" data-remove-watch="' + D.escapeHtml(sym) + '" style="font-size:12px;min-height:30px;padding:0 10px;margin-top:0">Remove</button>' +
        '</div>' +
        '</div>';
    }).join("");
    c.querySelectorAll("[data-remove-watch]").forEach(function (b) {
      b.addEventListener("click", function () { S.removeFromWatchlist(b.dataset.removeWatch); renderWatchlist(); updateCounts(); S.toast("Removed.", "info"); });
    });
  }

  // ── Alerts ──
  var alertForm = document.getElementById("alertForm");
  if (alertForm) alertForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var a = {
      symbol: D.cleanSymbol(document.getElementById("alertSymbol").value),
      direction: document.getElementById("alertDirection").value,
      price: parseFloat(document.getElementById("alertPrice").value),
      label: document.getElementById("alertTrigger").value,
      note: document.getElementById("alertNote").value
    };
    if (!a.symbol || !a.price) { S.toast("Symbol and price required.", "error"); return; }
    S.saveAlert(a); S.toast("Alert saved.", "success"); renderAlerts(); updateCounts(); alertForm.reset();
  });

  function renderAlerts() {
    var c = document.getElementById("alertList"); if (!c) return;
    var list = S.getAlerts();
    if (!list.length) { c.className = "simple-list empty-state"; c.textContent = "No alerts saved yet."; return; }
    c.className = "simple-list";
    c.innerHTML = list.map(function (a) {
      return '<div class="list-row row-split"><div><strong>' + D.escapeHtml(a.symbol) + " " + a.direction + " $" + D.escapeHtml(String(a.price)) + '</strong><span>' + D.escapeHtml(a.label || "") + "</span></div>" +
        '<button class="ghost-btn" data-del-alert="' + a.id + '" style="font-size:12px;min-height:30px;padding:0 10px">Delete</button></div>';
    }).join("");
    c.querySelectorAll("[data-del-alert]").forEach(function (b) {
      b.addEventListener("click", function () { S.deleteAlert(b.dataset.delAlert); renderAlerts(); updateCounts(); S.toast("Deleted.", "info"); });
    });
  }

  function updateCounts() {
    setText("marketWatchCount", String(S.getWatchlist().length));
    setText("marketAlertCount", String(S.getAlerts().length));
  }

  // ── Multi-Timeframe Analysis ──
  function renderMultiTimeframe(sym) {
    var tfEl = document.getElementById("marketTimeframeCard");
    if (!tfEl) return;
    tfEl.className = "loading-state";
    tfEl.textContent = "Analyzing timeframes…";

    var timeframes = [
      { label: "Daily", interval: "1d" },
      { label: "1 Hour", interval: "1h" },
      { label: "15 Min", interval: "15m" }
    ];

    Promise.all(timeframes.map(function (tf) {
      return D.fetchCandles(sym, tf.interval).then(function (candles) {
        return { label: tf.label, result: D.analyzeCandles(sym, candles) };
      }).catch(function () { return { label: tf.label, result: null }; });
    })).then(function (results) {
      // Alignment indicator
      var ratings = results.map(function (r) { return r.result && r.result.rating; }).filter(Boolean);
      var allBull = ratings.every(function (r) { return r === 'BUY'; });
      var allBear = ratings.every(function (r) { return r === 'SELL'; });
      var alignClass = allBull ? 'buy' : allBear ? 'sell' : 'hold';
      var alignLabel = allBull ? 'Full Bull Alignment' : allBear ? 'Full Bear Alignment' : 'Mixed Signals';

      tfEl.className = "tf-grid";
      tfEl.innerHTML =
        '<div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
        '<span style="font:500 12px var(--font-mono);color:var(--text-muted)">Timeframe Alignment</span>' +
        '<span class="mini-chip ' + alignClass + '" style="font-size:11px">' + alignLabel + '</span>' +
        '</div>' +
        results.map(function (r) {
          if (!r.result) return '<div class="tf-card"><div class="tf-label">' + D.escapeHtml(r.label) + '</div><div class="tf-signal">—</div></div>';
          var emoji = r.result.rating === "BUY" ? "🟢" : r.result.rating === "SELL" ? "🔴" : "🟡";
          var rc = r.result.rating === "BUY" ? "buy" : r.result.rating === "SELL" ? "sell" : "hold";
          return '<div class="tf-card">' +
            '<div class="tf-label">' + D.escapeHtml(r.label) + '</div>' +
            '<div class="tf-signal">' + emoji + '</div>' +
            '<span class="mini-chip ' + rc + '" style="font-size:11px;margin-top:6px;display:inline-flex">' + r.result.rating + ' ' + r.result.confidence + '%</span>' +
            '<div style="margin-top:4px;font-size:12px;color:var(--text-muted)">' + D.escapeHtml(r.result.metrics.price) + ' · RSI: ' + D.escapeHtml(r.result.metrics.rsi) + '</div>' +
            '</div>';
        }).join("");
    });
  }

  D.fetchNews = D.fetchNews || function (sym) {
    return D.fetchPublicApiJson("candles?symbol=" + encodeURIComponent(sym) + "&limit=1", "news")
      .then(function () { return []; })
      .catch(function () { return []; });
  };

  renderWatchlist(); renderAlerts(); updateCounts(); loadOverview();
})();
