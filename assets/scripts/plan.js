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

  // ── Presets ──
  var presets = [
    { name: "Breakout", desc: "Price clears resistance on volume. Entry above the level, stop below." },
    { name: "Pullback", desc: "Retrace to a moving average or prior support in an uptrend. Buy the dip." },
    { name: "VWAP Reclaim", desc: "Price reclaims VWAP with momentum. Good for intraday longs." },
    { name: "Reversal", desc: "Exhaustion candle at a key level. Counter-trend, smaller size." },
    { name: "Range Trade", desc: "Buy near support, sell near resistance inside a defined range." },
    { name: "News Catalyst", desc: "Event-driven move. Requires fast execution and tight risk." }
  ];
  var presetGrid = document.getElementById("presetGrid");
  if (presetGrid) {
    presetGrid.innerHTML = presets.map(function (p) {
      return '<div class="preset-card"><strong>' + D.escapeHtml(p.name) + "</strong><p>" + D.escapeHtml(p.desc) + "</p></div>";
    }).join("");
    presetGrid.querySelectorAll(".preset-card").forEach(function (card, i) {
      card.style.cursor = "pointer";
      card.addEventListener("click", function () { setVal("setupType", presets[i].name); S.toast(presets[i].name + " preset selected.", "info"); });
    });
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

  // ── Pattern grid ──
  var patterns = [
    { name: "Bull Flag", desc: "Tight consolidation after a strong move up. Breakout resumes the trend." },
    { name: "Bear Flag", desc: "Tight consolidation after a strong move down. Breakdown continues selling." },
    { name: "Double Bottom", desc: "Two tests of support at the same level. Bullish reversal signal." },
    { name: "Head & Shoulders", desc: "Three peaks with the middle tallest. Bearish reversal when the neckline breaks." },
    { name: "Ascending Triangle", desc: "Higher lows into flat resistance. Bullish bias, breakout above." },
    { name: "Descending Triangle", desc: "Lower highs into flat support. Bearish bias, breakdown below." }
  ];
  var patternGrid = document.getElementById("patternGrid");
  if (patternGrid) {
    patternGrid.innerHTML = patterns.map(function (p) {
      return '<div class="pattern-card"><strong>' + D.escapeHtml(p.name) + "</strong><p>" + D.escapeHtml(p.desc) + "</p></div>";
    }).join("");
  }

  computeRisk(); gradeSetup(); renderSaved();
})();
