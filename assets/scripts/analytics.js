/* analytics.js — Portfolio analytics dashboard */
(function () {
  'use strict';
  var D = window.DTO, S = window.Site;

  // ── Gather trade data ──
  function buildTrades() {
    var trades = [];

    // From reviews (journal entries)
    S.getReviews().forEach(function (r) {
      var pnl = parseFloat(r.pnl || 0);
      if (!pnl && r.exitPrice != null && r.entry != null && r.qty != null) {
        var diff = (parseFloat(r.exitPrice) - parseFloat(r.entry)) * parseFloat(r.qty);
        if (r.side === 'short') diff = -diff;
        pnl = diff;
      }
      var outcome = r.outcome || (pnl > 0.01 ? 'win' : pnl < -0.01 ? 'loss' : 'scratch');
      trades.push({
        id: r.id,
        symbol: (r.symbol || '?').toUpperCase(),
        pnl: pnl,
        outcome: outcome,
        date: r.savedAt || r.closedAt || null,
        rr: parseFloat(r.rr || 0),
        source: 'review'
      });
    });

    // From portfolio closed trades (deduplicate by approximate time+symbol)
    var reviewIds = new Set(trades.map(function (t) { return t.id; }));
    (S.getPortfolio().closed || []).forEach(function (t) {
      if (reviewIds.has(t.id)) return;
      var pnl = (parseFloat(t.exitPrice || 0) - parseFloat(t.entry || 0)) * parseFloat(t.qty || 1);
      if (t.side === 'short') pnl = -pnl;
      trades.push({
        id: t.id || Math.random().toString(36).slice(2),
        symbol: (t.symbol || '?').toUpperCase(),
        pnl: pnl,
        outcome: pnl > 0.01 ? 'win' : pnl < -0.01 ? 'loss' : 'scratch',
        date: t.closedAt || t.savedAt || null,
        rr: 0,
        source: 'portfolio'
      });
    });

    trades.sort(function (a, b) {
      return new Date(a.date || 0) - new Date(b.date || 0);
    });
    return trades;
  }

  // ── Stat card helper ──
  function statCard(label, value, sub, valueClass) {
    return '<div class="analytics-stat-card">' +
      '<span class="stat-label">' + D.escapeHtml(label) + '</span>' +
      '<span class="stat-value ' + (valueClass || '') + '">' + D.escapeHtml(String(value)) + '</span>' +
      (sub ? '<span class="stat-sub">' + D.escapeHtml(sub) + '</span>' : '') +
      '</div>';
  }

  // ── Render stats ──
  function renderStats(trades) {
    var el = document.getElementById('analyticsStats');
    if (!el) return;
    if (!trades.length) {
      el.innerHTML = '<div class="analytics-stat-card empty-state" style="grid-column:1/-1">No trades logged yet. Close a paper trade or add a review to see analytics.</div>';
      return;
    }
    var totalPnl = trades.reduce(function (s, t) { return s + t.pnl; }, 0);
    var wins = trades.filter(function (t) { return t.outcome === 'win'; }).length;
    var losses = trades.filter(function (t) { return t.outcome === 'loss'; }).length;
    var winRate = trades.length ? Math.round(wins / trades.length * 100) : 0;
    var rrTrades = trades.filter(function (t) { return t.rr > 0; });
    var avgRR = rrTrades.length
      ? (rrTrades.reduce(function (s, t) { return s + t.rr; }, 0) / rrTrades.length).toFixed(2)
      : '--';

    var pnlClass = totalPnl >= 0 ? 'positive' : 'negative';
    var pnlSub = wins + 'W / ' + losses + 'L / ' + (trades.length - wins - losses) + ' scratch';
    el.innerHTML =
      statCard('Total P&L', D.formatMoney(totalPnl), pnlSub, pnlClass) +
      statCard('Win Rate', winRate + '%', trades.length + ' total trades', winRate >= 50 ? 'positive' : '') +
      statCard('Trade Count', trades.length, wins + ' wins, ' + losses + ' losses') +
      statCard('Avg R:R', avgRR + (avgRR !== '--' ? 'R' : ''), rrTrades.length + ' trades with R:R logged');
  }

  // ── Render equity curve ──
  function renderEquity(trades) {
    var el = document.getElementById('analyticsEquity');
    if (!el) return;
    if (!trades.length) { el.className = 'analytics-chart-wrap empty-state'; el.textContent = 'No closed trades yet.'; return; }

    var cumPnl = [];
    var running = 0;
    trades.forEach(function (t) {
      running += t.pnl;
      cumPnl.push(running);
    });

    if (cumPnl.length < 2) {
      el.className = 'analytics-chart-wrap';
      el.innerHTML = '<div style="text-align:center;color:var(--text-muted);font:500 14px var(--font-mono)">' + D.formatMoney(running) + ' · ' + trades.length + ' trade' + (trades.length !== 1 ? 's' : '') + '</div>';
      return;
    }

    var min = Math.min.apply(null, cumPnl), max = Math.max.apply(null, cumPnl);
    var range = max - min || 1;
    var w = 800, h = 160, pad = 20;
    var stepX = (w - pad * 2) / (cumPnl.length - 1);
    var zero = h - pad - ((0 - min) / range) * (h - pad * 2);

    var points = cumPnl.map(function (v, i) {
      var x = pad + i * stepX;
      var y = h - pad - ((v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });

    var color = running >= 0 ? 'var(--green)' : 'var(--red)';
    var zeroLine = zero > pad && zero < h - pad
      ? '<line x1="' + pad + '" y1="' + zero.toFixed(1) + '" x2="' + (w - pad) + '" y2="' + zero.toFixed(1) + '" stroke="var(--line)" stroke-width="1" stroke-dasharray="4,4"/>'
      : '';

    el.className = 'analytics-chart-wrap';
    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<rect width="' + w + '" height="' + h + '" fill="none"/>' +
      zeroLine +
      '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' + points.join(' ') + '"/>' +
      '<text x="' + (pad + 4) + '" y="' + (pad + 14) + '" font-family="monospace" font-size="11" fill="var(--text-muted)">' + D.formatMoney(max) + '</text>' +
      '<text x="' + (pad + 4) + '" y="' + (h - pad - 4) + '" font-family="monospace" font-size="11" fill="var(--text-muted)">' + D.formatMoney(min) + '</text>' +
      '<text x="' + (w - pad - 4) + '" y="' + (h - pad + 14) + '" font-family="monospace" font-size="11" fill="var(--text-muted)" text-anchor="end">' + trades.length + ' trades</text>' +
      '</svg>';
  }

  // ── Render day-of-week bars ──
  function renderDayBars(trades) {
    var el = document.getElementById('analyticsDayBars');
    if (!el) return;
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    var wins = [0, 0, 0, 0, 0], totals = [0, 0, 0, 0, 0];

    trades.forEach(function (t) {
      if (!t.date) return;
      var d = new Date(t.date).getDay();
      if (d >= 1 && d <= 5) {
        var idx = d - 1;
        totals[idx]++;
        if (t.outcome === 'win') wins[idx]++;
      }
    });

    var hasTrades = totals.some(function (n) { return n > 0; });
    if (!hasTrades) { el.className = 'analytics-day-bars empty-state'; el.textContent = 'No dated trades yet.'; return; }

    el.className = 'analytics-day-bars';
    el.innerHTML = days.map(function (day, i) {
      var pct = totals[i] ? Math.round(wins[i] / totals[i] * 100) : 0;
      return '<div class="day-bar-row">' +
        '<span class="day-bar-label">' + day + '</span>' +
        '<div class="day-bar-track"><div class="day-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="day-bar-pct">' + (totals[i] ? pct + '%' : '--') + '</span>' +
        '<span class="day-bar-count">' + (totals[i] ? totals[i] + ' trade' + (totals[i] !== 1 ? 's' : '') : '') + '</span>' +
        '</div>';
    }).join('');
  }

  // ── Render symbols table ──
  function renderSymbols(trades) {
    var el = document.getElementById('analyticsSymbols');
    if (!el) return;
    if (!trades.length) { el.className = 'analytics-symbols-list empty-state'; el.textContent = 'No data yet.'; return; }

    var symMap = {};
    trades.forEach(function (t) {
      if (!symMap[t.symbol]) symMap[t.symbol] = { wins: 0, total: 0, pnl: 0 };
      symMap[t.symbol].total++;
      symMap[t.symbol].pnl += t.pnl;
      if (t.outcome === 'win') symMap[t.symbol].wins++;
    });

    var sorted = Object.keys(symMap).sort(function (a, b) {
      return Math.abs(symMap[b].pnl) - Math.abs(symMap[a].pnl);
    }).slice(0, 10);

    el.className = 'analytics-symbols-list';
    el.innerHTML = sorted.map(function (sym) {
      var s = symMap[sym];
      var wr = Math.round(s.wins / s.total * 100);
      var pnlClass = s.pnl >= 0 ? 'positive' : 'negative';
      return '<div class="sym-row">' +
        '<span class="sym-name">' + D.escapeHtml(sym) + '</span>' +
        '<span class="sym-pnl ' + pnlClass + '">' + D.formatMoney(s.pnl) + '</span>' +
        '<span class="sym-wr">' + wr + '% · ' + s.total + 't</span>' +
        '</div>';
    }).join('');
  }

  // ── Render P&L calendar heatmap ──
  function renderCalendar(trades) {
    var el = document.getElementById('analyticsCalendar');
    if (!el) return;

    var pnlByDate = {};
    trades.forEach(function (t) {
      if (!t.date) return;
      var d = new Date(t.date);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      pnlByDate[key] = (pnlByDate[key] || 0) + t.pnl;
    });

    if (!Object.keys(pnlByDate).length) {
      el.className = 'analytics-calendar-wrap empty-state';
      el.textContent = 'No trades with dates in the last year.';
      return;
    }

    // Build 52-week grid ending today
    var today = new Date();
    var startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 52 * 7 + 1);
    // Roll back to Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());

    var weeks = [];
    var cur = new Date(startDate);
    var maxAbs = Math.max.apply(null, Object.values(pnlByDate).map(Math.abs)) || 1;

    while (cur <= today) {
      var week = [];
      for (var d = 0; d < 7; d++) {
        var key = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
        var pnl = pnlByDate[key];
        var future = cur > today;
        week.push({ key: key, pnl: pnl, future: future, date: new Date(cur) });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }

    el.className = 'analytics-calendar-wrap';

    var html = '<div class="calendar-grid">';
    var prevMonth = -1;
    weeks.forEach(function (week) {
      html += '<div class="calendar-week">';
      week.forEach(function (cell) {
        if (cell.future) {
          html += '<div class="calendar-cell" style="opacity:0"></div>';
          return;
        }
        var cls = 'calendar-cell';
        if (cell.pnl != null) {
          var intensity = Math.min(1, Math.abs(cell.pnl) / (maxAbs * 0.5));
          if (cell.pnl > 0.01) cls += intensity > 0.6 ? ' win strong' : ' win';
          else if (cell.pnl < -0.01) cls += intensity > 0.6 ? ' loss strong' : ' loss';
          else cls += ' scratch';
        }
        var label = cell.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        var pnlLabel = cell.pnl != null ? ' ' + D.formatMoney(cell.pnl) : ' No trades';
        html += '<div class="' + cls + '" title="' + label + pnlLabel + '"></div>';
      });
      html += '</div>';
    });
    html += '</div>';

    el.innerHTML = html;
  }

  // ── Render streaks ──
  function renderStreaks(trades) {
    var el = document.getElementById('analyticsStreaks');
    if (!el) return;
    if (!trades.length) {
      el.innerHTML = '<div class="analytics-stat-card empty-state" style="grid-column:1/-1">No trades yet.</div>';
      return;
    }

    var curStreak = 0, maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
    var biggestWin = trades.reduce(function (best, t) { return t.pnl > best.pnl ? t : best; }, trades[0]);
    var biggestLoss = trades.reduce(function (worst, t) { return t.pnl < worst.pnl ? t : worst; }, trades[0]);

    trades.forEach(function (t) {
      if (t.outcome === 'win') {
        curWin++; curLoss = 0;
        if (curWin > maxWin) maxWin = curWin;
      } else if (t.outcome === 'loss') {
        curLoss++; curWin = 0;
        if (curLoss > maxLoss) maxLoss = curLoss;
      } else {
        curWin = 0; curLoss = 0;
      }
    });

    var lastT = trades[trades.length - 1];
    if (lastT.outcome === 'win') curStreak = curWin;
    else if (lastT.outcome === 'loss') curStreak = -curLoss;

    var streakLabel = curStreak > 0 ? '+' + curStreak + ' wins' : curStreak < 0 ? curStreak * -1 + ' losses' : 'No streak';
    var streakClass = curStreak > 0 ? 'positive' : curStreak < 0 ? 'negative' : '';

    var avgWin = 0, avgLoss = 0;
    var winArr = trades.filter(function (t) { return t.pnl > 0; });
    var lossArr = trades.filter(function (t) { return t.pnl < 0; });
    if (winArr.length) avgWin = winArr.reduce(function (s, t) { return s + t.pnl; }, 0) / winArr.length;
    if (lossArr.length) avgLoss = lossArr.reduce(function (s, t) { return s + t.pnl; }, 0) / lossArr.length;

    el.innerHTML =
      statCard('Current Streak', streakLabel, curStreak === 0 ? 'Neither win nor loss last' : 'in a row', streakClass) +
      statCard('Best Win Streak', maxWin + ' wins', 'consecutive', 'positive') +
      statCard('Worst Loss Streak', maxLoss + ' losses', 'consecutive', maxLoss > 3 ? 'negative' : '') +
      statCard('Avg Win', D.formatMoney(avgWin), winArr.length + ' winning trades', 'positive') +
      statCard('Avg Loss', D.formatMoney(avgLoss), lossArr.length + ' losing trades', avgLoss < 0 ? 'negative' : '') +
      statCard('Best Trade', D.formatMoney(biggestWin.pnl), biggestWin.symbol, 'positive') +
      statCard('Worst Trade', D.formatMoney(biggestLoss.pnl), biggestLoss.symbol, 'negative');
  }

  // ── Main render ──
  function render() {
    var trades = buildTrades();
    renderStats(trades);
    renderEquity(trades);
    renderDayBars(trades);
    renderSymbols(trades);
    renderCalendar(trades);
    renderStreaks(trades);
  }

  render();

  var refreshBtn = document.getElementById('analyticsRefresh');
  if (refreshBtn) refreshBtn.addEventListener('click', render);
})();
