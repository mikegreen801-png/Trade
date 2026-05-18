/* god_mode.js - Monte Carlo Simulation Logic */
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
  
  form.addEventListener("submit", function(e) {
    e.preventDefault();
    
    var payload = {
      initial_capital: parseFloat(document.getElementById("simCapital").value),
      iterations: parseInt(document.getElementById("simIterations").value, 10),
      periods: 252, // 1 year of trading days
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
    
    fetch("http://localhost:8000/api/bot/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      runBtn.textContent = "Run Simulation";
      runBtn.disabled = false;
      
      if (data.error) {
        emptyState.textContent = "Error: " + data.error;
        return;
      }
      
      emptyState.style.display = "none";
      resultsData.style.display = "flex";
      
      document.getElementById("resRuin").textContent = data.probability_of_ruin_pct + "%";
      document.getElementById("resMedian").textContent = fmtMoney(data.median_ending_capital);
      document.getElementById("resMax").textContent = fmtMoney(data.max_ending_capital);
      document.getElementById("resMin").textContent = fmtMoney(data.min_ending_capital);
      
      drawSpaghettiChart(data.sample_paths);
      drawBellCurve(data.distribution);
    })
    .catch(err => {
      runBtn.textContent = "Run Simulation";
      runBtn.disabled = false;
      emptyState.textContent = "Simulation failed: Ensure Python Trading Engine is running.";
    });
  });
  
  function drawSpaghettiChart(paths) {
    var container = document.getElementById("spaghettiChart");
    container.innerHTML = '<canvas id="spaghettiCanvas" style="width:100%;height:100%"></canvas>';
    var canvas = document.getElementById("spaghettiCanvas");
    var ctx = canvas.getContext("2d");
    
    // Fit to container
    var rect = container.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    var w = rect.width;
    var h = rect.height;
    
    if (!paths || paths.length === 0) return;
    
    // Find global min/max for scaling
    var minVal = Infinity, maxVal = -Infinity;
    var maxLen = 0;
    paths.forEach(p => {
      if (p.length > maxLen) maxLen = p.length;
      p.forEach(val => {
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      });
    });
    
    // Pad scale
    maxVal *= 1.1;
    if (minVal > 0) minVal *= 0.9;
    var range = maxVal - minVal;
    
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3;
    
    paths.forEach((path, i) => {
      // Color gradient based on ending value
      var endVal = path[path.length - 1];
      var startVal = path[0];
      if (endVal > startVal * 1.5) ctx.strokeStyle = "#4CAF50"; // Green
      else if (endVal < startVal * 0.5) ctx.strokeStyle = "#F44336"; // Red
      else ctx.strokeStyle = "#2196F3"; // Blue
      
      ctx.beginPath();
      path.forEach((val, step) => {
        var x = (step / (maxLen - 1)) * w;
        var y = h - ((val - minVal) / range) * h;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    
    // Draw initial capital line
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
    var maxCount = Math.max(...dist.counts);
    var numBins = dist.counts.length;
    var barWidth = w / numBins;
    
    ctx.fillStyle = "#2196F3";
    ctx.globalAlpha = 0.8;
    
    dist.counts.forEach((count, i) => {
      var barHeight = (count / maxCount) * (h * 0.9); // 90% of height max
      var x = i * barWidth;
      var y = h - barHeight;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });
  }
})();
