/* live_sim.js — Live Paper Trading Simulator runtime */
(function () {
  "use strict";
  var D = window.DTO, S = window.Site;

  var STATE_KEY = "dto_live_sim_state";
  var STARTING_CASH = 100000;

  // ── State ──
  var state = loadState();
  var currentSym = null;
  var livePrice = null;
  var activeSide = "long";

  function defaultState() {
    return { cash: STARTING_CASH, positions: [], trades: [] };
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY)) || defaultState(); }
    catch (e) { return defaultState(); }
  }

  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  // ── Symbol Load ──
  var loadForm = document.getElementById("simLoadForm");
  var symInput = document.getElementById("simSymbolInput");

  if (loadForm) {
    loadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = (symInput.value || "").trim();
      if (raw) loadSymbol(raw);
    });
  }

  document.querySelectorAll("[data-symbol]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sym = btn.dataset.symbol;
      if (symInput) symInput.value = sym;
      loadSymbol(sym);
    });
  });

  function loadSymbol(raw) {
    var sym = D.cleanSymbol(raw);
    if (sym === currentSym) return;

    // Stop previous stream
    if (currentSym) D.stopStream(currentSym);
    currentSym = sym;
    livePrice = null;

    // Load TradingView chart
    var chartWrap = document.getElementById("simChartContainer");
    if (chartWrap) {
      chartWrap.innerHTML = '<iframe src="' + D.tradingViewEmbedUrl(sym) + '" allowfullscreen style="width:100%;height:100%;border:none;border-radius:16px"></iframe>';
    }

    // Show symbol in panel header
    var symLabel = document.getElementById("simCurrentSym");
    if (symLabel) symLabel.textContent = sym;

    // Get seed price from candles, then stream live
    D.fetchCandles(sym).then(function (candles) {
      if (candles && candles.length) {
        var seed = candles[candles.length - 1].close;
        onPriceTick(seed);
      }
    }).catch(function () {});

    // Start live price stream
    if (D.isCryptoSymbol(sym)) {
      D.streamCryptoPrice(sym, onPriceTick);
    } else {
      D.streamStockPrice(sym, onPriceTick);
      // Fallback polling for stocks when no Alpaca WS keys
      startPricePoll(sym);
    }
  }

  var _pollTimer = null;
  function startPricePoll(sym) {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(function () {
      if (currentSym !== sym) { clearInterval(_pollTimer); return; }
      D.fetchCandles(sym).then(function (candles) {
        if (candles && candles.length) onPriceTick(candles[candles.length - 1].close);
      }).catch(function () {});
    }, 30000);
  }

  function onPriceTick(price) {
    livePrice = price;

    var priceEl = document.getElementById("simLivePrice");
    if (priceEl) priceEl.textContent = D.fmtPrice(price);

    // Auto-fill entry field if empty or stale
    var entryInput = document.getElementById("simEntry");
    if (entryInput && !entryInput.dataset.userEdited) entryInput.value = price.toFixed(2);

    renderStats();
    renderPositions();
  }

  // ── Side Toggle ──
  document.querySelectorAll("[data-side]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeSide = btn.dataset.side;
      document.querySelectorAll("[data-side]").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
    });
  });

  // Mark entry as user-edited when they type in it
  var entryInput = document.getElementById("simEntry");
  if (entryInput) {
    entryInput.addEventListener("input", function () { entryInput.dataset.userEdited = "1"; });
  }

  // ── Open Trade ──
  var tradeForm = document.getElementById("simTradeForm");
  if (tradeForm) {
    tradeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!currentSym) { S.toast("Load a symbol first.", "error"); return; }
      var qty = parseFloat(document.getElementById("simQty").value) || 0;
      var entry = parseFloat(document.getElementById("simEntry").value) || livePrice || 0;
      var stop = parseFloat(document.getElementById("simStop").value) || 0;
      var target = parseFloat(document.getElementById("simTarget").value) || 0;

      if (qty <= 0) { S.toast("Enter a valid quantity.", "error"); return; }
      if (!entry) { S.toast("Entry price required.", "error"); return; }

      var cost = entry * qty;
      if (activeSide === "long" && cost > state.cash) {
        S.toast("Insufficient cash ($" + D.fmtPrice(state.cash) + " available).", "error"); return;
      }

      var pos = {
        id: Date.now().toString(36),
        symbol: currentSym,
        side: activeSide,
        qty: qty,
        entry: entry,
        stop: stop || null,
        target: target || null,
        openedAt: new Date().toISOString()
      };

      if (activeSide === "long") state.cash -= cost;
      state.positions.push(pos);
      saveState();

      // Reset form fields
      document.getElementById("simQty").value = "";
      document.getElementById("simStop").value = "";
      document.getElementById("simTarget").value = "";
      if (entryInput) delete entryInput.dataset.userEdited;

      S.toast("Trade opened: " + activeSide.toUpperCase() + " " + qty + " " + currentSym + " @ $" + entry.toFixed(2), "success");
      renderStats();
      renderPositions();
    });
  }

  // ── Close Position ──
  function closePosition(id) {
    var idx = state.positions.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return;
    var pos = state.positions[idx];
    var exit = livePrice || pos.entry;
    var pnl = (exit - pos.entry) * pos.qty * (pos.side === "short" ? -1 : 1);

    if (pos.side === "long") state.cash += exit * pos.qty;
    else state.cash += pnl;

    state.trades.unshift({
      id: pos.id, symbol: pos.symbol, side: pos.side,
      qty: pos.qty, entry: pos.entry, exit: exit, pnl: pnl,
      closedAt: new Date().toISOString()
    });
    state.positions.splice(idx, 1);
    saveState();

    S.toast((pnl >= 0 ? "+" : "") + D.fmtPrice(pnl) + " on " + pos.symbol, pnl >= 0 ? "success" : "error");
    renderStats();
    renderPositions();
    renderHistory();
  }

  // ── Render Stats ──
  function renderStats() {
    var openPnl = state.positions.reduce(function (sum, p) {
      var price = (p.symbol === currentSym && livePrice) ? livePrice : p.entry;
      return sum + (price - p.entry) * p.qty * (p.side === "short" ? -1 : 1);
    }, 0);
    var equity = state.cash + state.positions.reduce(function (sum, p) {
      var price = (p.symbol === currentSym && livePrice) ? livePrice : p.entry;
      return sum + price * p.qty;
    }, 0);
    var wins = state.trades.filter(function (t) { return t.pnl > 0; }).length;
    var winRate = state.trades.length ? Math.round(wins / state.trades.length * 100) : 0;

    setText("simCash", "$" + D.fmtPrice(state.cash));
    setText("simEquity", "$" + D.fmtPrice(equity));
    setColored("simOpenPnl", openPnl);
    setText("simWinRate", winRate + "% (" + state.trades.length + " trades)");
  }

  // ── Render Open Positions ──
  function renderPositions() {
    var el = document.getElementById("simPositions");
    if (!el) return;
    if (!state.positions.length) {
      el.innerHTML = '<div class="empty-state" style="padding:16px;font-size:13px">No open positions.</div>';
      return;
    }
    el.innerHTML = state.positions.map(function (p) {
      var price = (p.symbol === currentSym && livePrice) ? livePrice : p.entry;
      var pnl = (price - p.entry) * p.qty * (p.side === "short" ? -1 : 1);
      var pnlColor = pnl >= 0 ? "var(--green)" : "var(--red)";
      var pnlStr = (pnl >= 0 ? "+" : "") + D.fmtPrice(pnl);
      return '<div class="list-row row-split" style="align-items:center;gap:8px">' +
        '<div style="min-width:0">' +
          '<strong style="font-family:var(--font-mono)">' + p.symbol + '</strong>' +
          '<span style="margin-left:6px;font-size:12px;text-transform:uppercase;color:var(--text-soft)">' + p.side + '</span>' +
          '<div style="font-size:12px;color:var(--text-soft)">' + p.qty + ' shares @ $' + p.entry.toFixed(2) + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
          '<div style="font-family:var(--font-mono);font-weight:700;color:' + pnlColor + '">' + pnlStr + '</div>' +
          '<button class="ghost-btn" data-close-pos="' + p.id + '" style="font-size:11px;min-height:26px;padding:0 10px;margin-top:4px">Close</button>' +
        '</div>' +
        '</div>';
    }).join('<hr style="border:none;border-top:1px solid var(--line);margin:0">');

    el.querySelectorAll("[data-close-pos]").forEach(function (btn) {
      btn.addEventListener("click", function () { closePosition(btn.dataset.closePos); });
    });
  }

  // ── Render Trade History ──
  function renderHistory() {
    var el = document.getElementById("simTradeLog");
    if (!el) return;
    if (!state.trades.length) {
      el.innerHTML = '<div class="empty-state" style="padding:16px;font-size:13px">No closed trades yet.</div>';
      return;
    }
    el.innerHTML = state.trades.slice(0, 20).map(function (t) {
      var pnlColor = t.pnl >= 0 ? "var(--green)" : "var(--red)";
      var badge = t.pnl >= 0 ? "win" : "loss";
      var pnlStr = (t.pnl >= 0 ? "+" : "") + D.fmtPrice(t.pnl);
      return '<div class="list-row row-split" style="align-items:center">' +
        '<div>' +
          '<strong style="font-family:var(--font-mono)">' + t.symbol + '</strong>' +
          '<span class="mini-chip ' + badge + '" style="margin-left:6px;font-size:10px">' + badge.toUpperCase() + '</span>' +
          '<div style="font-size:12px;color:var(--text-soft)">$' + t.entry.toFixed(2) + ' → $' + t.exit.toFixed(2) + ' · ' + t.qty + ' sh</div>' +
        '</div>' +
        '<strong style="font-family:var(--font-mono);color:' + pnlColor + '">' + pnlStr + '</strong>' +
        '</div>';
    }).join('<hr style="border:none;border-top:1px solid var(--line);margin:0">');
  }

  // ── Reset ──
  var resetBtn = document.getElementById("simReset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (!confirm("Reset account to $100,000? All positions and history will be cleared.")) return;
      if (currentSym) D.stopStream(currentSym);
      currentSym = null; livePrice = null;
      state = defaultState();
      saveState();
      var chartWrap = document.getElementById("simChartContainer");
      if (chartWrap) chartWrap.innerHTML = '<div class="empty-state" style="height:100%;display:grid;place-items:center;font-size:14px;color:var(--text-soft)">Load a symbol to see the live chart.</div>';
      var symLabel = document.getElementById("simCurrentSym");
      if (symLabel) symLabel.textContent = "—";
      var priceEl = document.getElementById("simLivePrice");
      if (priceEl) priceEl.textContent = "—";
      renderStats(); renderPositions(); renderHistory();
      S.toast("Account reset to $100,000.", "info");
    });
  }

  // ── Helpers ──
  function setText(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; }
  function setColored(id, val) {
    var e = document.getElementById(id);
    if (!e) return;
    e.textContent = (val >= 0 ? "+" : "") + D.fmtPrice(val);
    e.style.color = val >= 0 ? "var(--green)" : "var(--red)";
  }

  // ── Init ──
  renderStats();
  renderPositions();
  renderHistory();

  // Auto-load symbol from URL param
  var urlSym = new URLSearchParams(location.search).get("symbol");
  if (urlSym) { if (symInput) symInput.value = urlSym; loadSymbol(urlSym); }
})();
