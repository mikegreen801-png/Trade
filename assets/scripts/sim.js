/* sim.js — Backtest Simulator runtime */
(function () {
  "use strict";
  var D = window.DTO;

  var state = {
    candles: [],
    index: 0,
    playing: false,
    position: null, // { side, entryPrice }
    trades: [],
    timer: null
  };

  var els = {
    sym: document.getElementById("simSymbol"),
    load: document.getElementById("simLoadBtn"),
    play: document.getElementById("simPlayBtn"),
    next: document.getElementById("simNextBtn"),
    reset: document.getElementById("simResetBtn"),
    buy: document.getElementById("simBuyBtn"),
    sell: document.getElementById("simSellBtn"),
    canvas: document.getElementById("simCanvas"),
    msg: document.getElementById("simOverlayMsg"),
    price: document.getElementById("simCurrentPrice"),
    prog: document.getElementById("simProgress"),
    pos: document.getElementById("simOpenPos"),
    unrl: document.getElementById("simUnrealized"),
    pnl: document.getElementById("simPnl"),
    win: document.getElementById("simWinRate"),
    logs: document.getElementById("simLogsTableBody"),
    status: document.getElementById("simStatus")
  };

  var ctx = els.canvas ? els.canvas.getContext("2d") : null;

  function resizeCanvas() {
    if (!els.canvas) return;
    var rect = els.canvas.parentElement.getBoundingClientRect();
    els.canvas.width = rect.width;
    els.canvas.height = rect.height;
    draw();
  }
  window.addEventListener("resize", resizeCanvas);

  function draw() {
    if (!ctx || !state.candles.length) return;
    var w = els.canvas.width;
    var h = els.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Number of candles to show at once
    var visibleCount = 60;
    var startIdx = Math.max(0, state.index - visibleCount + 1);
    var visibleCandles = state.candles.slice(startIdx, state.index + 1);
    if (!visibleCandles.length) return;

    // Find min/max for scaling
    var min = Math.min.apply(null, visibleCandles.map(function(c) { return c.low; }));
    var max = Math.max.apply(null, visibleCandles.map(function(c) { return c.high; }));
    var range = max - min || 1;
    // Add 10% padding top and bottom
    min -= range * 0.1;
    max += range * 0.1;
    range = max - min;

    var candleW = w / visibleCount;
    var space = candleW * 0.2;
    var bodyW = candleW - space;

    visibleCandles.forEach(function(c, i) {
      var x = i * candleW + space / 2;
      var yHigh = h - ((c.high - min) / range) * h;
      var yLow = h - ((c.low - min) / range) * h;
      var yOpen = h - ((c.open - min) / range) * h;
      var yClose = h - ((c.close - min) / range) * h;

      var isUp = c.close >= c.open;
      var color = isUp ? "#188038" : "#d93025";

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      
      // Wick
      ctx.beginPath();
      ctx.moveTo(x + bodyW / 2, yHigh);
      ctx.lineTo(x + bodyW / 2, yLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      var bodyTop = Math.min(yOpen, yClose);
      var bodyH = Math.max(Math.abs(yClose - yOpen), 1);
      ctx.fillRect(x, bodyTop, bodyW, bodyH);
    });

    // Draw current price line
    var currentC = visibleCandles[visibleCandles.length - 1];
    if (currentC) {
      var currY = h - ((currentC.close - min) / range) * h;
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currY);
      ctx.lineTo(w, currY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(w - 60, currY - 10, 60, 20);
      ctx.fillStyle = "#fff";
      ctx.font = "11px var(--font-mono)";
      ctx.fillText(currentC.close.toFixed(2), w - 55, currY + 4);
    }
  }

  function updateUI() {
    if (!state.candles.length) return;
    var curr = state.candles[state.index];
    if (els.price) els.price.textContent = D.fmtPrice(curr.close);
    if (els.prog) els.prog.textContent = (state.index + 1) + " / " + state.candles.length;

    // Position
    if (state.position) {
      els.pos.textContent = (state.position.side === "long" ? "LONG @ " : "SHORT @ ") + D.fmtPrice(state.position.entryPrice);
      els.buy.textContent = state.position.side === "long" ? "Close Long" : "Reverse to Long";
      els.sell.textContent = state.position.side === "short" ? "Close Short" : "Reverse to Short";
      
      var unrl = (curr.close - state.position.entryPrice) * (state.position.side === "short" ? -1 : 1);
      els.unrl.textContent = D.formatMoney(unrl);
      els.unrl.className = unrl >= 0 ? "status-positive" : "status-negative";
    } else {
      els.pos.textContent = "None";
      els.buy.textContent = "Buy";
      els.sell.textContent = "Sell";
      els.unrl.textContent = "--";
      els.unrl.className = "";
    }

    // Stats
    var net = state.trades.reduce(function(acc, t) { return acc + t.pnl; }, 0);
    var wins = state.trades.filter(function(t) { return t.pnl > 0; }).length;
    if (els.pnl) {
      els.pnl.textContent = D.formatMoney(net);
      els.pnl.className = net >= 0 ? "status-positive" : "status-negative";
    }
    if (els.win) {
      els.win.textContent = state.trades.length ? Math.round((wins / state.trades.length) * 100) + "%" : "--%";
    }

    // Buttons
    els.play.disabled = false;
    els.next.disabled = false;
    els.reset.disabled = false;
    els.buy.disabled = false;
    els.sell.disabled = false;

    if (state.index >= state.candles.length - 1) {
      els.play.disabled = true;
      els.next.disabled = true;
      stopPlay();
    }
  }

  function renderLogs() {
    if (!els.logs) return;
    if (!state.trades.length) {
      els.logs.innerHTML = '<tr><td colspan="4" class="empty-state" style="text-align: center; padding: 24px 0;">No trades taken yet in this session.</td></tr>';
      return;
    }
    els.logs.innerHTML = state.trades.map(function(t) {
      var cls = t.pnl >= 0 ? "status-positive" : "status-negative";
      return "<tr>" +
        "<td>" + t.side.toUpperCase() + "</td>" +
        "<td>" + D.fmtPrice(t.entry) + "</td>" +
        "<td>" + D.fmtPrice(t.exit) + "</td>" +
        "<td class='" + cls + "'>" + D.formatMoney(t.pnl) + "</td>" +
      "</tr>";
    }).join("");
  }

  function closePos() {
    if (!state.position) return;
    var exit = state.candles[state.index].close;
    var entry = state.position.entryPrice;
    var pnl = (exit - entry) * (state.position.side === "short" ? -1 : 1);
    state.trades.unshift({ side: state.position.side, entry: entry, exit: exit, pnl: pnl });
    state.position = null;
    renderLogs();
  }

  function step() {
    if (state.index < state.candles.length - 1) {
      state.index++;
      draw();
      updateUI();
    }
  }

  function togglePlay() {
    if (state.playing) { stopPlay(); }
    else {
      state.playing = true;
      els.play.textContent = "⏸ Pause";
      state.timer = setInterval(step, 800);
      if (els.status) els.status.textContent = "Running";
    }
  }

  function stopPlay() {
    state.playing = false;
    els.play.textContent = "▶ Play";
    clearInterval(state.timer);
    if (els.status && state.candles.length) els.status.textContent = "Paused";
  }

  // Bindings
  if (els.load) els.load.addEventListener("click", function() {
    var sym = D.cleanSymbol(els.sym.value);
    if (!sym) return;
    stopPlay();
    if (els.msg) els.msg.textContent = "Loading data for " + sym + "...";
    
    D.fetchCandles(sym).then(function(c) {
      if (!c || !c.length) throw new Error("No data");
      state.candles = c;
      state.index = Math.min(30, c.length - 1); // Show 30 candles of context initially
      state.trades = [];
      state.position = null;
      if (els.msg) els.msg.style.display = "none";
      if (els.status) els.status.textContent = "Ready";
      resizeCanvas();
      updateUI();
      renderLogs();
    }).catch(function(err) {
      if (els.msg) els.msg.textContent = "Error: " + err.message;
    });
  });

  if (els.next) els.next.addEventListener("click", step);
  if (els.play) els.play.addEventListener("click", togglePlay);
  if (els.reset) els.reset.addEventListener("click", function() {
    stopPlay();
    state.index = 0;
    state.trades = [];
    state.position = null;
    draw(); updateUI(); renderLogs();
  });

  if (els.buy) els.buy.addEventListener("click", function() {
    if (state.position) {
      if (state.position.side === "long") { closePos(); }
      else { closePos(); state.position = { side: "long", entryPrice: state.candles[state.index].close }; }
    } else {
      state.position = { side: "long", entryPrice: state.candles[state.index].close };
    }
    updateUI();
  });

  if (els.sell) els.sell.addEventListener("click", function() {
    if (state.position) {
      if (state.position.side === "short") { closePos(); }
      else { closePos(); state.position = { side: "short", entryPrice: state.candles[state.index].close }; }
    } else {
      state.position = { side: "short", entryPrice: state.candles[state.index].close };
    }
    updateUI();
  });

  setTimeout(resizeCanvas, 100);
})();
