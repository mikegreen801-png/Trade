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

  // Check URL param on load
  var urlParams = new URLSearchParams(location.search);
  if (urlParams.get("symbol")) { if (input) input.value = urlParams.get("symbol"); analyze(urlParams.get("symbol")); }

  function analyze(raw) {
    var sym = D.cleanSymbol(raw);
    var card = document.getElementById("marketAnalysisCard");
    var ctx = document.getElementById("marketContextCard");
    card.className = "loading-state"; card.textContent = "Analyzing " + sym + "…";
    ctx.className = "loading-state"; ctx.textContent = "Loading context…";
    D.fetchCandles(sym).then(function (candles) {
      var r = D.analyzeCandles(sym, candles); currentResult = r;
      S.saveSetup({ symbol: r.symbol, rating: r.rating, confidence: r.confidence, price: r.raw.price, entry: r.raw.price, stop: r.raw.stop, target: r.raw.target, support: r.raw.support, resistance: r.raw.resistance, rr: r.raw.rr, side: r.rating === "SELL" ? "short" : "long", thesis: r.rationale[0] || "" });
      renderAnalysis(card, r); renderContext(ctx, r);
      // Show TradingView chart
      var chartWrap = document.getElementById("marketChartContainer");
      var chartBox = document.getElementById("marketChart");
      if (chartWrap && chartBox) {
        chartWrap.style.display = "";
        chartBox.className = "chart-container";
        chartBox.innerHTML = '<iframe src="' + D.tradingViewEmbedUrl(sym) + '" allowfullscreen></iframe>';
      }
    }).catch(function (err) { card.className = "empty-state"; card.textContent = "Error: " + err.message; ctx.className = "empty-state"; ctx.textContent = "Context unavailable."; });
  }

  function renderAnalysis(el, r) {
    var rc = r.rating === "BUY" ? "buy" : r.rating === "SELL" ? "sell" : "hold";
    var urls = D.sourceUrls(r.symbol);
    el.className = "analysis-shell";
    el.innerHTML = '<div class="analysis-header"><div><h3>' + D.escapeHtml(r.symbol) + '</h3><p style="margin:4px 0 0;color:var(--text-muted);font-size:14px">' + D.escapeHtml(r.name) + '</p></div><span class="analysis-rating mini-chip ' + rc + '">' + r.rating + " " + r.confidence + "%</span></div>" +
      '<div class="analysis-metrics">' + mk("Price", r.metrics.price) + mk("Support", r.metrics.support) + mk("Resistance", r.metrics.resistance) + mk("Stop", r.metrics.stop) + mk("Target", r.metrics.target) + mk("R:R", r.metrics.rr) + mk("RSI", r.metrics.rsi) + mk("Volume", r.metrics.volume) + "</div>" +
      '<div class="analysis-note">' + r.rationale.map(function (l) { return "<p style='margin:6px 0'>" + D.escapeHtml(l) + "</p>"; }).join("") + "</div>" +
      '<div class="source-links">' + sl("TradingView", urls.tradingView) + sl("Yahoo", urls.yahoo) + sl("CNBC", urls.cnbc) + sl("Finviz", urls.finviz) + sl("Ground News", urls.ground) + "</div>";
  }

  function renderContext(el, r) {
    var mc = r.marketContext; if (!mc) { el.className = "empty-state"; el.textContent = "No context."; return; }
    el.className = "analysis-shell";
    var html = '<div class="analysis-note">' + mc.summary.map(function (l) { return "<p style='margin:6px 0'>" + D.escapeHtml(l) + "</p>"; }).join("") + "</div>";
    html += '<div class="source-links">';
    var feeds = mc.feeds;
    ["yahoo","cnbc","earnings","sec","macro","sector","groundNews"].forEach(function (k) {
      if (feeds[k]) html += sl(feeds[k].label, feeds[k].url);
    });
    html += "</div>";
    el.innerHTML = html;
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
    var results = [];
    var done = 0;
    benchmarks.forEach(function (sym, i) {
      D.fetchCandles(sym).then(function (candles) {
        var r = D.analyzeCandles(sym, candles);
        results[i] = r;
      }).catch(function () { results[i] = null; }).finally(function () {
        done++;
        if (done === benchmarks.length) {
          grid.className = "benchmark-grid";
          grid.innerHTML = results.map(function (r) {
            if (!r) return "";
            var rc = r.rating === "BUY" ? "buy" : r.rating === "SELL" ? "sell" : "hold";
            return '<div class="benchmark-card"><strong>' + D.escapeHtml(r.symbol) + '</strong> <span class="mini-chip ' + rc + '" style="font-size:11px">' + r.rating + "</span><span>" + D.escapeHtml(r.metrics.price) + " · RSI " + D.escapeHtml(r.metrics.rsi) + "</span></div>";
          }).join("");
        }
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
            return '<div class="scanner-card"><strong>' + D.escapeHtml(r.symbol) + '</strong> <span class="mini-chip ' + rc + '" style="font-size:11px">' + r.rating + " " + r.confidence + "%</span><span>" + D.escapeHtml(r.metrics.price) + " · R:R " + D.escapeHtml(r.metrics.rr) + "</span></div>";
          }).join("");
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
      return '<div class="watch-card"><strong>' + D.escapeHtml(sym) + '</strong><span><button class="ghost-btn" data-remove-watch="' + D.escapeHtml(sym) + '" style="font-size:12px;min-height:30px;padding:0 10px">Remove</button></span></div>';
    }).join("");
    c.querySelectorAll("[data-remove-watch]").forEach(function (b) {
      b.addEventListener("click", function () { S.removeFromWatchlist(b.dataset.removeWatch); renderWatchlist(); updateCounts(); S.toast("Removed.", "info"); });
    });
  }

  // ── Alerts ──
  var alertForm = document.getElementById("alertForm");
  if (alertForm) alertForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var a = { symbol: D.cleanSymbol(document.getElementById("alertSymbol").value), direction: document.getElementById("alertDirection").value, price: parseFloat(document.getElementById("alertPrice").value), label: document.getElementById("alertTrigger").value, note: document.getElementById("alertNote").value };
    if (!a.symbol || !a.price) { S.toast("Symbol and price required.", "error"); return; }
    S.saveAlert(a); S.toast("Alert saved.", "success"); renderAlerts(); updateCounts(); alertForm.reset();
  });

  function renderAlerts() {
    var c = document.getElementById("alertList"); if (!c) return;
    var list = S.getAlerts();
    if (!list.length) { c.className = "simple-list empty-state"; c.textContent = "No alerts saved yet."; return; }
    c.className = "simple-list";
    c.innerHTML = list.map(function (a) {
      return '<div class="list-row row-split"><div><strong>' + D.escapeHtml(a.symbol) + " " + a.direction + " " + D.escapeHtml(String(a.price)) + '</strong><span>' + D.escapeHtml(a.label || "") + "</span></div>" +
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

  renderWatchlist(); renderAlerts(); updateCounts(); loadOverview();
})();
