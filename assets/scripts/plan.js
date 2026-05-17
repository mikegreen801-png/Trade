/* plan.js — Plan hub page runtime */
(function () {
  "use strict";
  var D = window.DTO, S = window.Site;

  function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
  function setVal(id, v) { var e = document.getElementById(id); if (e) e.value = v; }

  // ── Load active setup ──
  var loadBtn = document.getElementById("planLoadSetup");
  if (loadBtn) loadBtn.addEventListener("click", function () {
    var s = S.getSetup(); if (!s) { S.toast("No active setup. Analyze a symbol first.", "error"); return; }
    setVal("symbol", s.symbol || ""); setVal("assetType", D.isCryptoSymbol(s.symbol) ? "crypto" : "stock");
    setVal("side", s.side || "long"); setVal("entry", s.entry || ""); setVal("stop", s.stop || "");
    setVal("target", s.target || ""); setVal("rating", s.rating || "CHECK");
    setVal("support", s.support || ""); setVal("resistance", s.resistance || "");
    setVal("confidence", s.confidence || 50); setVal("thesis", s.thesis || "");
    computeRisk(); gradeSetup(); S.toast("Setup loaded.", "success");
  });

  // ── Auto-price / Symbol lookup ──
  var symbolInput = document.getElementById("symbol");
  var symbolHint = document.getElementById("planSymbolHint");
  var lookupTimeout;

  if (symbolInput) {
    symbolInput.addEventListener("input", function() {
      var sym = D.cleanSymbol(symbolInput.value);
      if (!sym) {
        if (symbolHint) { symbolHint.textContent = "Type a symbol to fetch the latest price and bias."; symbolHint.className = "symbol-hint"; }
        return;
      }
      
      if (symbolHint) { symbolHint.textContent = "Fetching " + sym + "…"; symbolHint.className = "symbol-hint fetching"; }
      
      clearTimeout(lookupTimeout);
      lookupTimeout = setTimeout(function() {
        D.fetchCandles(sym).then(function(candles) {
          if (!candles || !candles.length) throw new Error("No data");
          var r = D.analyzeCandles(sym, candles);
          
          setVal("assetType", D.isCryptoSymbol(sym) ? "crypto" : "stock");
          
          if (!val("entry")) setVal("entry", r.raw.price);
          if (!val("stop")) setVal("stop", r.raw.stop);
          if (!val("target")) setVal("target", r.raw.target);
          if (!val("support")) setVal("support", r.raw.support);
          if (!val("resistance")) setVal("resistance", r.raw.resistance);
          
          if (r.rating === "BUY" && !val("side")) setVal("side", "long");
          if (r.rating === "SELL" && !val("side")) setVal("side", "short");
          
          setVal("rating", r.rating);
          
          if (symbolHint) {
            symbolHint.textContent = "Current price: " + D.fmtPrice(r.raw.price) + " (" + r.rating + ")";
            symbolHint.className = "symbol-hint";
          }
          
          computeRisk();
          gradeSetup();
        }).catch(function(err) {
          if (symbolHint) {
            symbolHint.textContent = "Could not fetch price for " + sym + ".";
            symbolHint.className = "symbol-hint";
          }
        });
      }, 500); // 500ms debounce
    });
  }

  // ── Save setup form ──
  var form = document.getElementById("planSetupForm");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var setup = { symbol: D.cleanSymbol(val("symbol")), assetType: val("assetType"), side: val("side"), timeframe: val("timeframe"), entry: parseFloat(val("entry")), stop: parseFloat(val("stop")), target: parseFloat(val("target")), rating: val("rating"), support: parseFloat(val("support")), resistance: parseFloat(val("resistance")), confidence: parseInt(val("confidence"), 10), setupType: val("setupType"), thesis: val("thesis"), catalysts: val("catalysts") };
    S.saveSetup(setup); S.saveSetupToList(setup); computeRisk(); gradeSetup(); renderSaved();
    setText("planSavedCount", String(S.getSavedSetups().length));
    S.toast("Setup saved.", "success");
  });

  var resetBtn = document.getElementById("planResetForm");
  if (resetBtn) resetBtn.addEventListener("click", function () { if (form) form.reset(); computeRisk(); gradeSetup(); });

  // ── Risk calculator ──
  ["entry", "stop", "target", "accountSize", "riskPercent"].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.addEventListener("input", computeRisk);
  });

  function computeRisk() {
    var entry = parseFloat(val("entry")), stop = parseFloat(val("stop")), target = parseFloat(val("target"));
    var acct = parseFloat(val("accountSize")) || 10000, riskPct = parseFloat(val("riskPercent")) || 1;
    if (!entry || !stop) { setText("planQty", "--"); setText("planRisk", "$--"); setText("planNotional", "$--"); setText("planRr", "--"); return; }
    var riskPerShare = Math.abs(entry - stop);
    if (riskPerShare === 0) { setText("planQty", "--"); return; }
    var maxRisk = acct * (riskPct / 100);
    var qty = Math.floor(maxRisk / riskPerShare);
    var actualRisk = qty * riskPerShare;
    var notional = qty * entry;
    var rr = target ? Math.abs(target - entry) / riskPerShare : null;
    setText("planQty", String(qty));
    setText("planRisk", D.formatMoney(actualRisk));
    setText("planNotional", D.formatMoney(notional));
    setText("planRr", rr ? rr.toFixed(2) + "R" : "--");
    var note = document.getElementById("planChecklist");
    if (note) {
      var msgs = [];
      if (rr && rr < 1.5) msgs.push("R:R below 1.5 — consider widening target or tightening stop.");
      if (actualRisk > acct * 0.02) msgs.push("Risk exceeds 2% of account. Reduce size or tighten stop.");
      if (qty === 0) msgs.push("Position size rounds to 0 shares — risk per share is too large for this account.");
      note.textContent = msgs.length ? msgs.join(" ") : "Risk is within bounds. Entry, stop, and target look reasonable.";
    }
  }

  // ── Grade logic ──
  function gradeSetup() {
    var fields = ["symbol", "entry", "stop", "target", "thesis", "rating"];
    var filled = fields.filter(function (f) { return val(f).trim() !== ""; }).length;
    var pct = Math.round((filled / fields.length) * 100);
    var grade = pct >= 85 ? "A" : pct >= 65 ? "B" : pct >= 45 ? "C" : "D";
    setText("planGradeBadge", grade);
    setText("planGradeSummary", filled + "/" + fields.length + " fields completed.");
    var notes = document.getElementById("planGradeNotes");
    if (!notes) return;
    var items = [];
    if (!val("entry")) items.push("Entry price is missing.");
    if (!val("stop")) items.push("Stop level is missing — you have no defined risk.");
    if (!val("target")) items.push("Target is missing — R:R can't be calculated.");
    if (!val("thesis").trim()) items.push("Thesis is empty — write why this trade matters.");
    if (val("confidence") && parseInt(val("confidence"), 10) < 40) items.push("Low confidence — consider waiting for a better setup.");
    if (!items.length) items.push("Setup looks complete. Review the risk tab before executing.");
    notes.className = "simple-list";
    notes.innerHTML = items.map(function (i) { return '<div class="list-row"><span>' + D.escapeHtml(i) + "</span></div>"; }).join("");
  }

  // ── Presets with extended data ──
  var presets = [
    { name: "Breakout", setupType: "Breakout", desc: "Price clears resistance on volume. Entry above the level, stop below.", long: "A stock breaks above a key resistance level with increasing volume, signaling continuation. This is a momentum-driven trade — you want to enter as the breakout confirms and place your stop just below the breakout level.", entry: "Just above resistance", stop: "Just below the breakout level", target: "1.5–3× the risk distance", exampleSymbol: "NVDA" },
    { name: "Pullback", setupType: "Pullback", desc: "Retrace to a moving average or prior support in an uptrend. Buy the dip.", long: "In a strong uptrend, price temporarily pulls back to a rising moving average (20 EMA or 50 SMA) or prior support. This offers a lower-risk entry in the direction of the trend. Wait for a candle to hold the level before entering.", entry: "At or near the support/MA", stop: "Below the pullback low", target: "Previous high or extension", exampleSymbol: "AAPL" },
    { name: "VWAP Reclaim", setupType: "VWAP reclaim", desc: "Price reclaims VWAP with momentum. Good for intraday longs.", long: "An intraday setup where a stock that has been trading below VWAP reclaims it with conviction (volume + candle close above). This indicates institutional buying stepping in. Best during the first 2 hours of the session.", entry: "On the candle closing above VWAP", stop: "Below the reclaim candle low", target: "HOD or prior resistance", exampleSymbol: "TSLA" },
    { name: "Reversal", setupType: "Reversal", desc: "Exhaustion candle at a key level. Counter-trend, smaller size.", long: "Price reaches an extreme level (major support/resistance, round number) and prints a reversal candle (hammer, engulfing, doji). This is a mean-reversion trade — size should be smaller because you're going against the prevailing trend.", entry: "After the reversal candle confirms", stop: "Beyond the extreme wick", target: "Mean or nearest MA", exampleSymbol: "AMD" },
    { name: "Range Trade", setupType: "Range trade", desc: "Buy near support, sell near resistance inside a defined range.", long: "When a stock is consolidating in a clear range (horizontal support and resistance), you buy near the bottom and sell near the top. This works well in choppy, trendless markets. Use tight stops just outside the range boundary.", entry: "Near range support", stop: "Below range bottom", target: "Near range resistance", exampleSymbol: "SPY" },
    { name: "News Catalyst", setupType: "News catalyst", desc: "Event-driven move. Requires fast execution and tight risk.", long: "A stock gaps or surges on breaking news (earnings, FDA approval, M&A, macro event). The trade requires quick decision-making and tight risk management. Focus on the initial move and avoid chasing extended prices.", entry: "On the initial surge or pullback", stop: "Below the pre-news level", target: "Extension or measured move", exampleSymbol: "META" }
  ];

  // ── Patterns with extended data ──
  var patterns = [
    { name: "Bull Flag", desc: "Tight consolidation after a strong move up. Breakout resumes the trend.", long: "After a sharp move higher (the pole), price consolidates in a tight, slightly downward-sloping channel (the flag). The breakout above the flag confirms continuation. Volume should contract during the flag and expand on the breakout.", entry: "Above the flag's upper trendline", stop: "Below the flag's lower trendline", target: "Measured move equal to the pole", exampleSymbol: "NVDA" },
    { name: "Bear Flag", desc: "Tight consolidation after a strong move down. Breakdown continues selling.", long: "The inverse of a bull flag — after a sharp selloff (pole), price consolidates in a slight upward channel (flag). Breakdown below the flag confirms the continuation lower. Short sellers enter on the breakdown with a stop above the flag.", entry: "Below the flag's lower trendline", stop: "Above the flag's upper trendline", target: "Measured move equal to the pole", exampleSymbol: "TSLA" },
    { name: "Double Bottom", desc: "Two tests of support at the same level. Bullish reversal signal.", long: "Price tests a support level twice, forming a 'W' shape. The second test holds (often with divergent RSI) and breaks above the neckline. This is a classic reversal pattern signaling that sellers are exhausted.", entry: "Above the neckline", stop: "Below the second bottom", target: "Measured move from neckline", exampleSymbol: "AAPL" },
    { name: "Head & Shoulders", desc: "Three peaks with the middle tallest. Bearish reversal when the neckline breaks.", long: "A reversal pattern with three peaks — left shoulder, head (highest), right shoulder. When price breaks below the neckline connecting the two troughs, it signals a bearish reversal. The measured target equals the height from head to neckline.", entry: "Below the neckline break", stop: "Above the right shoulder", target: "Measured move from neckline", exampleSymbol: "MSFT" },
    { name: "Ascending Triangle", desc: "Higher lows into flat resistance. Bullish bias, breakout above.", long: "Price makes progressively higher lows while repeatedly testing a flat resistance level. This compression signals building buying pressure. The breakout above resistance is the entry trigger.", entry: "Above the flat resistance", stop: "Below the most recent higher low", target: "Measured height of the triangle", exampleSymbol: "GOOGL" },
    { name: "Descending Triangle", desc: "Lower highs into flat support. Bearish bias, breakdown below.", long: "Price makes progressively lower highs while testing a flat support level. This compression signals building selling pressure. The breakdown below support is the entry trigger for shorts.", entry: "Below the flat support", stop: "Above the most recent lower high", target: "Measured height of the triangle", exampleSymbol: "AMZN" }
  ];

  // ── Render preset grid ──
  var presetGrid = document.getElementById("presetGrid");
  if (presetGrid) {
    presetGrid.innerHTML = presets.map(function (p, i) {
      return '<div class="preset-card" data-preset-idx="' + i + '"><strong>' + D.escapeHtml(p.name) + "</strong><p>" + D.escapeHtml(p.desc) + "</p></div>";
    }).join("");
    presetGrid.addEventListener("click", function (e) {
      var card = e.target.closest("[data-preset-idx]");
      if (card) openDialog("preset", presets[parseInt(card.dataset.presetIdx, 10)]);
    });
  }

  // ── Render pattern grid ──
  var patternGrid = document.getElementById("patternGrid");
  if (patternGrid) {
    patternGrid.innerHTML = patterns.map(function (p, i) {
      return '<div class="pattern-card" data-pattern-idx="' + i + '"><strong>' + D.escapeHtml(p.name) + "</strong><p>" + D.escapeHtml(p.desc) + "</p></div>";
    }).join("");
    patternGrid.addEventListener("click", function (e) {
      var card = e.target.closest("[data-pattern-idx]");
      if (card) openDialog("pattern", patterns[parseInt(card.dataset.patternIdx, 10)]);
    });
  }

  // ── Dialog ──
  var dialog = document.getElementById("presetDialog");
  var closeBtn = document.getElementById("dialogClose");
  var dismissBtn = document.getElementById("dialogDismiss");
  var useBtn = document.getElementById("dialogUsePreset");
  var activeItem = null;

  if (closeBtn) closeBtn.addEventListener("click", function () { dialog.close(); });
  if (dismissBtn) dismissBtn.addEventListener("click", function () { dialog.close(); });
  if (useBtn) useBtn.addEventListener("click", function () {
    if (!activeItem) return;
    if (activeItem.setupType) setVal("setupType", activeItem.setupType);
    S.toast(activeItem.name + " loaded into the setup form.", "success");
    dialog.close();
  });

  function openDialog(type, item) {
    if (!dialog) return;
    activeItem = item;
    setText("dialogEyebrow", type === "preset" ? "Setup Preset" : "Pattern Reference");
    setText("dialogTitle", item.name);
    document.getElementById("dialogDesc").textContent = item.long || item.desc;

    // Rules
    var rulesEl = document.getElementById("dialogRules");
    rulesEl.innerHTML =
      '<div class="dialog-rule-card"><span>Entry</span><strong>' + D.escapeHtml(item.entry || "—") + '</strong></div>' +
      '<div class="dialog-rule-card"><span>Stop</span><strong>' + D.escapeHtml(item.stop || "—") + '</strong></div>' +
      '<div class="dialog-rule-card"><span>Target</span><strong>' + D.escapeHtml(item.target || "—") + '</strong></div>';

    // Chart
    var chartEl = document.getElementById("dialogChart");
    if (chartEl && item.exampleSymbol) {
      chartEl.className = "chart-container";
      chartEl.innerHTML = '<iframe src="' + D.tradingViewEmbedUrl(item.exampleSymbol) + '" allowfullscreen></iframe>';
    }

    // Show or hide "Use this preset" button
    useBtn.style.display = type === "preset" ? "" : "none";

    dialog.showModal();
  }

  // ── Saved setups ──
  function renderSaved() {
    var c = document.getElementById("savedSetupsList"); if (!c) return;
    var list = S.getSavedSetups();
    setText("planSavedCount", String(list.length));
    if (!list.length) { c.className = "simple-list empty-state"; c.textContent = "No setup packets saved yet."; return; }
    c.className = "simple-list";
    c.innerHTML = list.slice(0, 20).map(function (s) {
      return '<div class="list-row row-split"><div><strong>' + D.escapeHtml(s.symbol) + " " + (s.rating || s.side || "") + '</strong><span>' + D.escapeHtml(s.setupType || s.timeframe || "") + " · " + new Date(s.savedAt).toLocaleDateString() + "</span></div>" +
        '<div style="display:flex;gap:6px"><button class="ghost-btn" data-load-setup="' + s.id + '" style="font-size:12px;min-height:30px;padding:0 10px">Load</button><button class="ghost-btn" data-del-setup="' + s.id + '" style="font-size:12px;min-height:30px;padding:0 10px">Del</button></div></div>';
    }).join("");
    c.querySelectorAll("[data-load-setup]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = list.find(function (x) { return x.id === b.dataset.loadSetup; }); if (!s) return;
        S.saveSetup(s);
        setVal("symbol", s.symbol || ""); setVal("side", s.side || "long"); setVal("entry", s.entry || "");
        setVal("stop", s.stop || ""); setVal("target", s.target || ""); setVal("rating", s.rating || "CHECK");
        setVal("thesis", s.thesis || ""); setVal("catalysts", s.catalysts || "");
        setVal("confidence", s.confidence || 50); computeRisk(); gradeSetup(); S.toast("Loaded.", "success");
      });
    });
    c.querySelectorAll("[data-del-setup]").forEach(function (b) {
      b.addEventListener("click", function () { S.deleteSetupFromList(b.dataset.delSetup); renderSaved(); S.toast("Deleted.", "info"); });
    });
  }

  computeRisk(); gradeSetup(); renderSaved();
})();
