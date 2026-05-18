/* god_mode.js - Client-side Monte Carlo Simulation */
(function() {
  "use strict";

  var form = document.getElementById("godModeForm");
  var runBtn = document.getElementById("runSimBtn");
  var emptyState = document.getElementById("simEmptyState");
  var resultsData = document.getElementById("simResultsData");

  if (!form) return;

  function fmtMoney(num) {
    return "$" + Math.round(num).toLocaleString();
  }

  /* Pure Monte Carlo — runs entirely in the browser, no server needed */
  function runMonteCarlo(p) {
    var paths = [];
    var endings = [];
    var NUM_SAMPLE_PATHS = 50;

    for (var i = 0; i < p.iterations; i++) {
      var capital = p.initial_capital;
      var path = (i < NUM_SAMPLE_PATHS) ? [capital] : null;

      for (var day = 0; day < p.periods; day++) {
        /* Black swan check */
        if (Math.random() < p.black_swan_prob) {
          capital *= (1 - p.black_swan_drop_pct);
        } else {
          var win = Math.random() < p.win_rate;
          var move = win
            ? capital * (p.avg_win_pct - p.slippage_pct)
            : -capital * (p.avg_loss_pct + p.slippage_pct);
          capital += move;
        }
        if (capital <= 0) { capital = 0; break; }
        if (path) path.push(capital);
      }

      endings.push(capital);
      if (path) paths.push(path);
    }

    /* Stats */
    endings.sort(function(a, b) { return a - b; });
    var ruined = endings.filter(function(v) { return v <= 0; }).length;
    var median = endings[Math.floor(endings.length / 2)];

    /* Distribution histogram — 30 bins */
    var minE = endings[0], maxE = endings[endings.length - 1];
    var NUM_BINS = 30;
    var binSize = (maxE - minE) / NUM_BINS || 1;
    var counts = new Array(NUM_BINS).fill(0);
    endings.forEach(function(v) {
      var bin = Math.min(Math.floor((v - minE) / binSize), NUM_BINS - 1);
      counts[bin]++;
    });

    return {
      probability_of_ruin_pct: ((ruined / p.iterations) * 100).toFixed(1),
      median_ending_capital: median,
      max_ending_capital: endings[endings.length - 1],
      min_ending_capital: endings[0],
      sample_paths: paths,
      distribution: { counts: counts, min: minE, max: maxE }
    };
  }

  form.addEventListener("submit", function(e) {
    e.preventDefault();

    var payload = {
      initial_capital: parseFloat(document.getElementById("simCapital").value),
      iterations: parseInt(document.getElementById("simIterations").value, 10),
      periods: 252,
      win_rate: parseFloat(document.getElementById("simWinRate").value) / 100,
      avg_win_pct: parseFloat(document.getElementById("simAvgWin").value) / 100,
      avg_loss_pct: parseFloat(document.getElementById("simAvgLoss").value) / 100,
      slippage_pct: parseFloat(document.getElementById("simSlippage").value) / 100,
      black_swan_prob: parseFloat(document.getElementById("simSwanProb").value) / 100,
      black_swan_drop_pct: parseFloat(document.getElementById("simSwanDrop").value) / 100
    };

    runBtn.textContent = "Simulating...";
    runBtn.disabled = true;
    emptyState.textContent = "Running matrix computations...";
    emptyState.style.display = "flex";
    resultsData.style.display = "none";

    /* Defer to next tick so the UI updates before the heavy loop */
    setTimeout(function() {
      var data = runMonteCarlo(payload);

      runBtn.textContent = "Run Simulation";
      runBtn.disabled = false;
      emptyState.style.display = "none";
      resultsData.style.display = "flex";

      document.getElementById("resRuin").textContent = data.probability_of_ruin_pct + "%";
      document.getElementById("resMedian").textContent = fmtMoney(data.median_ending_capital);
      document.getElementById("resMax").textContent = fmtMoney(data.max_ending_capital);
      document.getElementById("resMin").textContent = fmtMoney(data.min_ending_capital);

      drawSpaghettiChart(data.sample_paths);
      drawBellCurve(data.distribution);
    }, 20);
  });

  function drawSpaghettiChart(paths) {
    var container = document.getElementById("spaghettiChart");
    container.innerHTML = '<canvas id="spaghettiCanvas" style="width:100%;height:100%"></canvas>';
    var canvas = document.getElementById("spaghettiCanvas");
    var ctx = canvas.getContext("2d");

    var rect = container.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    var w = rect.width;
    var h = rect.height;

    if (!paths || paths.length === 0) return;

    var minVal = Infinity, maxVal = -Infinity, maxLen = 0;
    paths.forEach(function(p) {
      if (p.length > maxLen) maxLen = p.length;
      p.forEach(function(val) {
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      });
    });

    maxVal *= 1.1;
    if (minVal > 0) minVal *= 0.9;
    var range = maxVal - minVal || 1;

    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3;

    paths.forEach(function(path) {
      var endVal = path[path.length - 1];
      var startVal = path[0];
      ctx.strokeStyle = endVal > startVal * 1.5 ? "#4CAF50"
        : endVal < startVal * 0.5 ? "#F44336"
        : "#2196F3";

      ctx.beginPath();
      path.forEach(function(val, step) {
        var x = (step / (maxLen - 1)) * w;
        var y = h - ((val - minVal) / range) * h;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    /* Starting capital baseline */
    var startY = h - ((paths[0][0] - minVal) / range) * h;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, startY);
    ctx.lineTo(w, startY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBellCurve(dist) {
    var container = document.getElementById("bellCurveChart");
    container.innerHTML = '<canvas id="bellCanvas" style="width:100%;height:100%"></canvas>';
    var canvas = document.getElementById("bellCanvas");
    var ctx = canvas.getContext("2d");

    var rect = container.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    var w = rect.width;
    var h = rect.height;

    if (!dist || !dist.counts) return;
    var maxCount = Math.max.apply(null, dist.counts);
    var numBins = dist.counts.length;
    var barWidth = w / numBins;

    ctx.fillStyle = "#2196F3";
    ctx.globalAlpha = 0.8;

    dist.counts.forEach(function(count, i) {
      var barHeight = (count / maxCount) * (h * 0.9);
      ctx.fillRect(i * barWidth + 1, h - barHeight, barWidth - 2, barHeight);
    });
  }
})();
