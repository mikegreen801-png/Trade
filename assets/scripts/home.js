/* home.js — Home workspace page runtime */
(function () {
  "use strict";
  var D = window.DTO, S = window.Site;
  var currentResult = null;

  function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }

  function metricMini(label, value) {
    return '<div class="metric-card"><span>' + D.escapeHtml(label) + "</span><strong>" + D.escapeHtml(value) + "</strong></div>";
  }
  function sourceLink(label, url) {
    return '<a href="' + D.escapeHtml(url) + '" target="_blank" rel="noopener">' + D.escapeHtml(label) + "</a>";
  }

  function refreshMetrics() {
    var info = S.sessionInfo();
    setText("homeSessionState", info.phase.label);
    setText("homeSessionNote", info.phase.state === "open" ? "US equities are trading now." : "Session is " + info.phase.label.toLowerCase() + ".");
    var setup = S.getSetup();
    if (setup) {
      setText("homeActiveSetup", setup.symbol + " " + (setup.rating || setup.side || "").toUpperCase());
      setText("homeActiveSetupNote", setup.thesis ? setup.thesis.slice(0, 60) : "Loaded from your last save.");
    }
    var port = S.getPortfolio();
    var openPnl = port.positions.reduce(function (s, p) {
      return s + ((p.currentPrice || p.entry) - p.entry) * p.qty * (p.side === "short" ? -1 : 1);
    }, 0);
    setText("homePaperPnl", D.formatMoney(openPnl));
    setText("homePaperNote", port.positions.length ? port.positions.length + " open position(s)." : "No open paper positions yet.");
    var reviews = S.getReviews();
    if (reviews.length) {
      var wins = reviews.filter(function (r) { return r.pnl > 0; }).length;
      setText("homeJournalEdge", Math.round((wins / reviews.length) * 100) + "%");
      setText("homeJournalNote", reviews.length + " reviewed trade(s).");
    }
    renderWatchlist();
  }

  function analyzeSymbol(sym) {
    var card = document.getElementById("homeAnalysisCard");
    var symbol = D.cleanSymbol(sym);
    card.className = "loading-state"; card.textContent = "Analyzing " + symbol + "…";
    D.fetchCandles(symbol).then(function (candles) {
      var r = D.analyzeCandles(symbol, candles);
      currentResult = r;
      S.saveSetup({ symbol: r.symbol, rating: r.rating, confidence: r.confidence, price: r.raw.price, entry: r.raw.price, stop: r.raw.stop, target: r.raw.target, support: r.raw.support, resistance: r.raw.resistance, rr: r.raw.rr, side: r.rating === "SELL" ? "short" : "long", thesis: r.rationale[0] || "", source: candles.source || "unknown" });
      var rc = r.rating === "BUY" ? "buy" : r.rating === "SELL" ? "sell" : "hold";
      var urls = D.sourceUrls(r.symbol);
      card.className = "analysis-shell";
      card.innerHTML = '<div class="analysis-header"><div><h3>' + D.escapeHtml(r.symbol) + '</h3><p style="margin:4px 0 0;color:var(--text-muted);font-size:14px">' + D.escapeHtml(r.name) + '</p></div><span class="analysis-rating mini-chip ' + rc + '">' + r.rating + " " + r.confidence + "%</span></div>" +
        '<div class="analysis-metrics">' + metricMini("Price", r.metrics.price) + metricMini("Support", r.metrics.support) + metricMini("Resistance", r.metrics.resistance) + metricMini("Stop", r.metrics.stop) + metricMini("Target", r.metrics.target) + metricMini("R:R", r.metrics.rr) + "</div>" +
        '<div class="analysis-note">' + r.rationale.map(function (l) { return "<p style='margin:6px 0'>" + D.escapeHtml(l) + "</p>"; }).join("") + "</div>" +
        '<div class="source-links">' + sourceLink("TradingView", urls.tradingView) + sourceLink("Yahoo", urls.yahoo) + sourceLink("CNBC", urls.cnbc) + sourceLink("Finviz", urls.finviz) + "</div>";
      refreshMetrics();
    }).catch(function (err) { card.className = "empty-state"; card.textContent = "Could not analyze " + symbol + ": " + err.message; });
  }

  var form = document.getElementById("homeAnalyzeForm");
  var input = document.getElementById("homeSymbolInput");
  if (form) form.addEventListener("submit", function (e) { e.preventDefault(); var s = (input.value || "").trim(); if (s) analyzeSymbol(s); });
  document.querySelectorAll("[data-symbol]").forEach(function (b) { b.addEventListener("click", function () { if (input) input.value = b.dataset.symbol; analyzeSymbol(b.dataset.symbol); }); });

  var addBtn = document.getElementById("homeAddWatchlist");
  if (addBtn) addBtn.addEventListener("click", function () {
    if (!currentResult) { S.toast("Analyze a symbol first.", "error"); return; }
    S.addToWatchlist(currentResult.symbol); S.toast(currentResult.symbol + " added to watchlist.", "success"); renderWatchlist();
  });

  function renderWatchlist() {
    var c = document.getElementById("homeWatchlist"); if (!c) return;
    var list = S.getWatchlist();
    if (!list.length) { c.className = "simple-list empty-state"; c.textContent = "No symbols saved yet."; return; }
    c.className = "simple-list";
    c.innerHTML = list.slice(0, 8).map(function (s) { return '<div class="list-row row-split"><strong>' + D.escapeHtml(s) + '</strong><a class="secondary-btn" href="market_intel.html?symbol=' + encodeURIComponent(s) + '#details">Open</a></div>'; }).join("");
  }

  refreshMetrics();
})();
