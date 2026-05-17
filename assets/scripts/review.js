/* review.js — Review hub page runtime */
(function () {
  "use strict";
  var D = window.DTO, S = window.Site;

  function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
  function setVal(id, v) { var e = document.getElementById(id); if (e) e.value = v; }

  // ── Load setup into review form ──
  var loadBtn = document.getElementById("reviewLoadSetup");
  if (loadBtn) loadBtn.addEventListener("click", function () {
    var s = S.getSetup(); if (!s) { S.toast("No active setup.", "error"); return; }
    setVal("reviewSymbol", s.symbol || ""); setVal("reviewSide", s.side || "long");
    setVal("reviewEntry", s.entry || s.price || "");
    S.toast("Setup loaded into review form.", "success");
  });

  // ── Auto-price / Symbol lookup ──
  var symbolInput = document.getElementById("reviewSymbol");
  var symbolHint = document.getElementById("reviewSymbolHint");
  var lookupTimeout;

  if (symbolInput) {
    symbolInput.addEventListener("input", function() {
      var sym = D.cleanSymbol(symbolInput.value);
      if (!sym) {
        if (symbolHint) { symbolHint.textContent = "Type a symbol to fetch the latest price."; symbolHint.className = "symbol-hint"; }
        return;
      }
      
      if (symbolHint) { symbolHint.textContent = "Fetching " + sym + "…"; symbolHint.className = "symbol-hint fetching"; }
      
      clearTimeout(lookupTimeout);
      lookupTimeout = setTimeout(function() {
        D.fetchCandles(sym).then(function(candles) {
          if (!candles || !candles.length) throw new Error("No data");
          var lastCandle = candles[candles.length - 1];
          
          if (!val("reviewEntry")) setVal("reviewEntry", lastCandle.close);
          
          if (symbolHint) {
            symbolHint.textContent = "Last close: " + D.fmtPrice(lastCandle.close);
            symbolHint.className = "symbol-hint";
          }
        }).catch(function(err) {
          if (symbolHint) {
            symbolHint.textContent = "Could not fetch price for " + sym + ".";
            symbolHint.className = "symbol-hint";
          }
        });
      }, 500); // 500ms debounce
    });
  }

  // ── Review form ──
  var form = document.getElementById("reviewForm");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var entry = parseFloat(val("reviewEntry")), exit = parseFloat(val("reviewExit"));
    var qty = parseFloat(val("reviewQty")) || 1;
    var side = val("reviewSide");
    var pnl = (exit - entry) * qty * (side === "short" ? -1 : 1);
    var review = {
      symbol: D.cleanSymbol(val("reviewSymbol")), side: side, qty: qty,
      setup: val("reviewSetup"), entry: entry, exit: exit, pnl: pnl,
      discipline: parseInt(val("reviewDisciplineInput"), 10) || 5,
      mistake: val("reviewMistake"), notes: val("reviewNotes")
    };
    if (!review.symbol || !entry) { S.toast("Symbol and entry required.", "error"); return; }
    S.saveReview(review);
    S.toast("Review saved. " + review.symbol + " " + D.formatMoney(pnl), pnl >= 0 ? "success" : "error");
    form.reset(); refreshUI();
  });

  // ── Review list ──
  function renderReviews() {
    var c = document.getElementById("reviewList"); if (!c) return;
    var list = S.getReviews();
    if (!list.length) { c.className = "lesson-grid empty-state"; c.textContent = "No reviewed trades yet."; return; }
    c.className = "lesson-grid";
    c.innerHTML = list.slice(0, 30).map(function (r) {
      var cls = (r.pnl || 0) >= 0 ? "status-positive" : "status-negative";
      return '<div class="list-row"><div><strong>' + D.escapeHtml(r.symbol) + " " + (r.side || "").toUpperCase() + '</strong> <span class="' + cls + '">' + D.formatMoney(r.pnl || 0) + "</span></div>" +
        "<span>" + D.escapeHtml(r.setup || "") + " · Discipline " + (r.discipline || "--") + "/10" +
        (r.mistake && r.mistake !== "None" ? ' · <span class="status-warning">' + D.escapeHtml(r.mistake) + "</span>" : "") + "</span>" +
        (r.notes ? '<span style="font-size:13px;color:var(--text-soft)">' + D.escapeHtml(r.notes.slice(0, 120)) + "</span>" : "") +
        '<span style="font-size:12px;color:var(--text-soft)">' + new Date(r.savedAt).toLocaleDateString() + "</span></div>";
    }).join("");
  }

  // ── Performance stats ──
  function computeStats() {
    var reviews = S.getReviews();
    setText("reviewTradeCount", String(reviews.length));
    if (!reviews.length) return;

    var wins = reviews.filter(function (r) { return (r.pnl || 0) > 0; });
    var netPnl = reviews.reduce(function (s, r) { return s + (r.pnl || 0); }, 0);
    var avgDisc = reviews.reduce(function (s, r) { return s + (r.discipline || 5); }, 0) / reviews.length;

    setText("reviewNetPnl", D.formatMoney(netPnl));
    setText("reviewWinRate", Math.round((wins.length / reviews.length) * 100) + "%");
    setText("reviewDiscipline", avgDisc.toFixed(1) + "/10");
    setText("reviewLastSymbol", reviews[0].symbol || "--");

    // Top mistake
    var mistakes = {};
    reviews.forEach(function (r) { if (r.mistake && r.mistake !== "None") { mistakes[r.mistake] = (mistakes[r.mistake] || 0) + 1; } });
    var topMistake = Object.keys(mistakes).sort(function (a, b) { return mistakes[b] - mistakes[a]; })[0];
    setText("reviewTopMistake", topMistake || "None");

    // Next focus coach note
    var note = document.getElementById("reviewCoachNote");
    if (note) {
      var msgs = [];
      if (topMistake) msgs.push("Your most repeated mistake is \"" + topMistake + "\". Make it tomorrow's focus rule.");
      if (avgDisc < 6) msgs.push("Average discipline is below 6 — slow down and trade smaller until it improves.");
      if (wins.length / reviews.length < 0.4) msgs.push("Win rate is below 40% — review your entry criteria and setup quality.");
      if (netPnl < 0) msgs.push("Net P&L is negative — consider paper trading only until your edge is positive.");
      if (!msgs.length) msgs.push("Solid recent performance. Stay disciplined and keep the sample growing.");
      setText("reviewNextFocus", msgs[0].split(".")[0]);
      note.textContent = msgs.join(" ");
    }
  }

  // ── Rules ──
  var ruleForm = document.getElementById("ruleForm");
  if (ruleForm) ruleForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var rule = { maxLoss: parseFloat(val("ruleMaxLoss")) || 300, emotion: val("ruleEmotion"), text: val("ruleText") };
    if (!rule.text) { S.toast("Write a rule first.", "error"); return; }
    S.saveRule(rule); S.toast("Rule saved.", "success"); ruleForm.reset(); renderRules();
  });

  function renderRules() {
    var c = document.getElementById("ruleList"); if (!c) return;
    var list = S.getRules();
    if (!list.length) { c.className = "simple-list empty-state"; c.textContent = "No daily rule saved yet."; return; }
    c.className = "simple-list";
    c.innerHTML = list.slice(0, 10).map(function (r) {
      return '<div class="list-row"><strong>' + D.escapeHtml(r.text) + '</strong><span>Max loss $' + (r.maxLoss || 300) + " · State: " + D.escapeHtml(r.emotion || "Calm") + " · " + new Date(r.savedAt).toLocaleDateString() + "</span></div>";
    }).join("");
  }

  function refreshUI() { renderReviews(); computeStats(); renderRules(); }
  refreshUI();
})();
