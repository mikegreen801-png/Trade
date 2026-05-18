/* home.js — Home page runtime */
(function () {
  "use strict";

  // ── Session info ──
  var info = Site.sessionInfo();
  var stateEl = document.getElementById("homeSessionState");
  var noteEl = document.getElementById("homeSessionNote");
  if (stateEl) stateEl.textContent = info.phase.label;
  if (noteEl) noteEl.textContent = info.phase.state === "open" ? "Market is live." : "Session is " + info.phase.label.toLowerCase() + ".";

  // ── Active setup pill ──
  var setup = Site.getSetup();
  if (setup) {
    var asEl = document.getElementById("homeActiveSetup");
    var anEl = document.getElementById("homeActiveSetupNote");
    if (asEl) asEl.textContent = (setup.symbol || "—") + " " + (setup.rating || "");
    if (anEl) anEl.textContent = setup.notes ? setup.notes.slice(0, 80) : "Loaded from local storage.";
  }

  // ── Paper P&L ──
  var portfolio = Site.getPortfolio();
  var paperPnl = 0;
  portfolio.positions.forEach(function (p) { paperPnl += (p.currentPrice || p.entry) * p.qty - p.entry * p.qty; });
  var pnlEl = document.getElementById("homePaperPnl");
  if (pnlEl) {
    pnlEl.textContent = "$" + paperPnl.toFixed(2);
    pnlEl.className = paperPnl >= 0 ? "status-positive" : "status-negative";
  }

  // ── Journal edge ──
  var reviews = Site.getReviews();
  var wins = reviews.filter(function (r) { return r.outcome === "win"; }).length;
  var edgeEl = document.getElementById("homeJournalEdge");
  if (edgeEl && reviews.length) edgeEl.textContent = Math.round(wins / reviews.length * 100) + "%";

  // ── Analyze form ──
  var form = document.getElementById("homeAnalyzeForm");
  var input = document.getElementById("homeSymbolInput");
  var card = document.getElementById("homeAnalysisCard");
  var chartContainer = document.getElementById("homeChartContainer");
  var chartBox = document.getElementById("homeChart");

  function sourceLink(label, url) {
    return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
  }

  function analyzeSymbol(sym) {
    if (!sym || !card) return;
    card.className = "analysis-shell";
    card.innerHTML = '<div class="loading-state">Analyzing ' + sym.toUpperCase() + '…</div>';

    DTO.fetchCandles(sym).then(function (candles) {
      if (!candles || !candles.length) { card.innerHTML = '<div class="empty-state">No data returned for ' + sym + '.</div>'; return; }
      var a = DTO.analyzeCandles(sym, candles);
      var urls = DTO.sourceUrls(sym);

      card.innerHTML =
        '<div class="analysis-header"><div><h3>' + a.symbol + '</h3><p>Explained rating from recent candle trend, momentum, and levels.</p></div>' +
        '<span class="mini-chip ' + a.rating.toLowerCase().replace(/\s/g, "") + '">' + a.rating + ' ' + a.confidence + '%</span></div>' +
        '<div class="analysis-metrics">' +
        '<div class="metric-card"><span>Price</span><strong>' + a.metrics.price + '</strong></div>' +
        '<div class="metric-card"><span>Support</span><strong>' + a.metrics.support + '</strong></div>' +
        '<div class="metric-card"><span>Resistance</span><strong>' + a.metrics.resistance + '</strong></div>' +
        '<div class="metric-card"><span>Stop</span><strong>' + a.metrics.stop + '</strong></div>' +
        '<div class="metric-card"><span>Target</span><strong>' + a.metrics.target + '</strong></div>' +
        '<div class="metric-card"><span>R:R</span><strong>' + a.metrics.rr + '</strong></div>' +
        '<div class="metric-card"><span>RSI</span><strong>' + a.metrics.rsi + '</strong></div>' +
        '<div class="metric-card"><span>Volume</span><strong>' + a.metrics.volume + '</strong></div>' +
        '</div>' +
        '<div class="analysis-note">' + (a.rationale || []).join("<br>") + '</div>' +
        '<div class="source-links">' + sourceLink("TradingView", urls.tradingView) + sourceLink("Yahoo", urls.yahoo) + sourceLink("CNBC", urls.cnbc) + sourceLink("Finviz", urls.finviz) + "</div>";

      // Save as active setup
      Site.saveSetup(a);
      var asEl2 = document.getElementById("homeActiveSetup");
      var anEl2 = document.getElementById("homeActiveSetupNote");
      if (asEl2) asEl2.textContent = a.symbol + " " + a.rating;
      if (anEl2) anEl2.textContent = (a.rationale && a.rationale[0]) ? a.rationale[0].slice(0, 80) : "Loaded from analysis.";

      // Show TradingView chart
      if (chartContainer && chartBox) {
        chartContainer.style.display = "";
        chartBox.className = "chart-container";
        chartBox.innerHTML = '<iframe src="' + DTO.tradingViewEmbedUrl(sym) + '" allowfullscreen loading="lazy"></iframe>';
      }

      // Start live price stream
      DTO.stopStream();
      var priceEl = card.querySelector(".metric-card strong");
      var lastStreamPrice = a.raw.price;
      function onPriceTick(newPrice) {
        if (!priceEl || newPrice === lastStreamPrice) return;
        priceEl.textContent = DTO.fmtPrice(newPrice);
        priceEl.className = newPrice > lastStreamPrice ? "price-tick-up" : "price-tick-down";
        lastStreamPrice = newPrice;
        // Check alerts
        Site.checkAlerts(sym, newPrice);
      }
      if (DTO.isCryptoSymbol(sym)) {
        DTO.streamCryptoPrice(sym, onPriceTick);
      } else {
        DTO.streamStockPrice(sym, onPriceTick);
      }
    }).catch(function (err) {
      card.innerHTML = '<div class="empty-state">Could not analyze ' + sym + ': ' + (err.message || err) + '</div>';
    });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      analyzeSymbol((input.value || "").trim());
    });
  }

  // ── Quick chips ──
  document.querySelectorAll("[data-symbol]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (input) input.value = btn.dataset.symbol;
      analyzeSymbol(btn.dataset.symbol);
    });
  });

  // ── Add to watchlist ──
  var wlBtn = document.getElementById("homeAddWatchlist");
  if (wlBtn) {
    wlBtn.addEventListener("click", function () {
      var sym = (input.value || "").trim().toUpperCase();
      if (!sym) return Site.toast("Enter a symbol first.", "error");
      Site.addToWatchlist(sym);
      Site.toast(sym + " added to watchlist.", "success");
      renderWatchlist();
    });
  }

  // ── Watchlist ──
  var wlContainer = document.getElementById("homeWatchlist");
  function renderWatchlist() {
    var list = Site.getWatchlist();
    if (!wlContainer) return;
    if (!list.length) { wlContainer.className = "simple-list empty-state"; wlContainer.textContent = "No symbols saved yet."; return; }
    wlContainer.className = "simple-list";
    wlContainer.innerHTML = list.map(function (s) {
      return '<div class="list-row row-split"><strong>' + s + '</strong><button class="ghost-btn" data-remove-wl="' + s + '">Remove</button></div>';
    }).join("");
    wlContainer.querySelectorAll("[data-remove-wl]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        Site.removeFromWatchlist(btn.dataset.removeWl);
        renderWatchlist();
        Site.toast(btn.dataset.removeWl + " removed.", "info");
      });
    });
  }
  renderWatchlist();

  // ── Paper equity curve ──
  var curveContainer = document.getElementById("homePaperChart");
  function renderEquityCurve() {
    var closed = portfolio.closed || [];
    if (!closed.length || !curveContainer) return;
    curveContainer.className = "equity-curve";
    curveContainer.style.borderStyle = "solid";

    // Build cumulative P&L series
    var cumPnl = [];
    var running = 0;
    closed.forEach(function (t) {
      var pnl = (t.exitPrice - t.entry) * t.qty * (t.side === "short" ? -1 : 1);
      running += pnl;
      cumPnl.push(running);
    });

    if (cumPnl.length < 2) { curveContainer.textContent = "$" + running.toFixed(2) + " from " + closed.length + " trade(s)."; return; }

    var min = Math.min.apply(null, cumPnl), max = Math.max.apply(null, cumPnl);
    var range = max - min || 1;
    var w = 400, h = 140, pad = 16;
    var stepX = (w - pad * 2) / (cumPnl.length - 1);

    var points = cumPnl.map(function (v, i) {
      var x = pad + i * stepX;
      var y = h - pad - ((v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    });

    var color = running >= 0 ? "#188038" : "#d93025";
    curveContainer.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:100%">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' + points.join(" ") + '"/>' +
      '</svg>';
  }
  renderEquityCurve();
})();
