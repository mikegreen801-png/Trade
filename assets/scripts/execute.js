/* execute.js — Execute hub page runtime */
(function () {
  "use strict";
  var D = window.DTO, S = window.Site;

  function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
  function setVal(id, v) { var e = document.getElementById(id); if (e) e.value = v; }

  // ── Load active setup into paper ticket ──
  var loadBtn = document.getElementById("executeLoadSetup");
  if (loadBtn) loadBtn.addEventListener("click", function () {
    var s = S.getSetup(); if (!s) { S.toast("No active setup.", "error"); return; }
    setVal("paperSymbol", s.symbol || ""); setVal("paperSide", s.side || "long");
    setVal("paperEntry", s.entry || s.price || ""); setVal("paperStop", s.stop || "");
    setVal("paperTarget", s.target || ""); setVal("paperThesis", s.thesis || "");
    var acct = S.getPortfolio().cash || 100000;
    var risk = Math.abs((s.entry || s.price || 0) - (s.stop || 0));
    if (risk > 0) setVal("paperQty", String(Math.floor((acct * 0.01) / risk)));
    S.toast("Setup loaded into ticket.", "success");
  });

  // ── Paper trade form ──
  var form = document.getElementById("paperTicketForm");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var port = S.getPortfolio();
    var pos = {
      id: Date.now().toString(36),
      symbol: D.cleanSymbol(val("paperSymbol")),
      side: val("paperSide"),
      qty: parseFloat(val("paperQty")) || 1,
      entry: parseFloat(val("paperEntry")),
      stop: parseFloat(val("paperStop")),
      target: parseFloat(val("paperTarget")),
      thesis: val("paperThesis"),
      currentPrice: parseFloat(val("paperEntry")),
      openedAt: new Date().toISOString()
    };
    if (!pos.entry || !pos.symbol) { S.toast("Symbol and entry required.", "error"); return; }
    var cost = pos.entry * pos.qty;
    if (cost > port.cash) { S.toast("Not enough paper cash ($" + D.formatMoney(port.cash) + ").", "error"); return; }
    port.cash -= cost;
    port.positions.push(pos);
    S.savePortfolio(port);
    S.toast("Paper trade opened: " + pos.symbol + " x" + pos.qty, "success");
    form.reset(); refreshUI();
  });

  var clearBtn = document.getElementById("paperClearForm");
  if (clearBtn) clearBtn.addEventListener("click", function () { if (form) form.reset(); });

  // ── Position list + close ──
  function renderPositions() {
    var c = document.getElementById("positionList"); if (!c) return;
    var port = S.getPortfolio();
    if (!port.positions.length) { c.className = "position-list simple-list empty-state"; c.textContent = "No open paper positions yet."; return; }
    c.className = "position-list simple-list";
    c.innerHTML = port.positions.map(function (p) {
      var pnl = ((p.currentPrice || p.entry) - p.entry) * p.qty * (p.side === "short" ? -1 : 1);
      var cls = pnl >= 0 ? "status-positive" : "status-negative";
      return '<div class="list-row row-split"><div><strong>' + D.escapeHtml(p.symbol) + " " + p.side.toUpperCase() + " x" + p.qty + '</strong><span>Entry ' + D.fmtPrice(p.entry) + ' · Now ' + D.fmtPrice(p.currentPrice || p.entry) + ' · <span class="' + cls + '">' + D.formatMoney(pnl) + "</span></span></div>" +
        '<button class="ghost-btn" data-close-pos="' + p.id + '" style="font-size:12px;min-height:30px;padding:0 10px">Close</button></div>';
    }).join("");
    c.querySelectorAll("[data-close-pos]").forEach(function (b) {
      b.addEventListener("click", function () { closePosition(b.dataset.closePos); });
    });
  }

  function closePosition(id) {
    var port = S.getPortfolio();
    var idx = port.positions.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return;
    var p = port.positions.splice(idx, 1)[0];
    var exitPrice = p.currentPrice || p.entry;
    var pnl = (exitPrice - p.entry) * p.qty * (p.side === "short" ? -1 : 1);
    port.cash += exitPrice * p.qty;
    port.closed.push({ symbol: p.symbol, side: p.side, qty: p.qty, entry: p.entry, exit: exitPrice, pnl: pnl, closedAt: new Date().toISOString() });
    S.savePortfolio(port);
    S.toast("Closed " + p.symbol + " for " + D.formatMoney(pnl), pnl >= 0 ? "success" : "error");
    refreshUI();
  }

  // ── Refresh portfolio with live prices ──
  var refreshBtn = document.getElementById("refreshPortfolio");
  if (refreshBtn) refreshBtn.addEventListener("click", function () {
    var port = S.getPortfolio();
    if (!port.positions.length) { S.toast("No open positions.", "info"); return; }
    var done = 0;
    port.positions.forEach(function (p) {
      D.fetchCandles(p.symbol).then(function (candles) {
        if (candles.length) p.currentPrice = candles[candles.length - 1].close;
      }).catch(function () {}).finally(function () {
        done++;
        if (done === port.positions.length) { S.savePortfolio(port); refreshUI(); S.toast("Quotes refreshed.", "success"); }
      });
    });
  });

  // ── Broker status ──
  var brokerBtn = document.getElementById("checkBrokerStatus");
  if (brokerBtn) brokerBtn.addEventListener("click", function () {
    var box = document.getElementById("brokerStatusBox");
    box.textContent = "Checking…";
    Promise.all([
      fetch("/api/health").then(function (r) { return r.json(); }).catch(function () { return { ok: false }; }),
      fetch("/api/alpaca-account").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (results) {
      var health = results[0], acct = results[1];
      var lines = [];
      lines.push("Server: " + (health && health.ok !== false ? "✓ online" : "✗ offline"));
      if (acct && acct.id) {
        lines.push("Alpaca: ✓ connected");
        lines.push("Account: " + (acct.account_number || acct.id));
        lines.push("Buying power: " + D.formatMoney(parseFloat(acct.buying_power || 0)));
        lines.push("Equity: " + D.formatMoney(parseFloat(acct.equity || 0)));
      } else { lines.push("Alpaca: ✗ not connected or keys missing"); }
      box.innerHTML = lines.map(function (l) { return "<div>" + D.escapeHtml(l) + "</div>"; }).join("");
    });
  });

  // ── Hedge calculator ──
  ["hedgeStrike", "hedgePremium", "hedgeContracts", "hedgeType"].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.addEventListener("input", computeHedge);
  });

  function computeHedge() {
    var strike = parseFloat(val("hedgeStrike")), premium = parseFloat(val("hedgePremium")) || 1.25;
    var contracts = parseInt(val("hedgeContracts"), 10) || 1, type = val("hedgeType");
    var cost = premium * 100 * contracts;
    var coverage = contracts * 100;
    setText("hedgeCost", D.formatMoney(cost));
    setText("hedgeCoverage", coverage + " shares");
    if (strike && type === "put") setText("hedgeBreakeven", D.fmtPrice(strike - premium));
    else if (strike && type === "call") setText("hedgeBreakeven", D.fmtPrice(strike + premium));
    else setText("hedgeBreakeven", "$--");
    setText("hedgeDirection", type === "put" ? "Downside protection" : "Upside cap / income");
  }

  // ── Summary metrics ──
  function refreshUI() {
    var port = S.getPortfolio();
    var openPnl = port.positions.reduce(function (s, p) {
      return s + ((p.currentPrice || p.entry) - p.entry) * p.qty * (p.side === "short" ? -1 : 1);
    }, 0);
    var realized = port.closed.reduce(function (s, c) { return s + (c.pnl || 0); }, 0);
    var equity = port.cash + port.positions.reduce(function (s, p) { return s + (p.currentPrice || p.entry) * p.qty; }, 0);
    setText("executeCash", D.formatMoney(port.cash));
    setText("executeOpenPnl", D.formatMoney(openPnl));
    setText("executePositionCount", String(port.positions.length));
    setText("executeEquity", D.formatMoney(equity));
    setText("executeRealized", D.formatMoney(realized));
    setText("executeWatchCount", String(S.getWatchlist().length));
    var last = port.closed.length ? port.closed[0] : null;
    setText("executeLastAction", last ? last.symbol + " " + D.formatMoney(last.pnl) : "--");
    renderPositions();
  }

  computeHedge(); refreshUI();
})();
