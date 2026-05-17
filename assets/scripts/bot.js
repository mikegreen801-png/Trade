/* bot.js — Bot Engine page runtime */
(function () {
  "use strict";
  var D = window.DTO, S = window.Site;

  var isEngineRunning = false;
  var engineStatusEl = document.getElementById("botEngineStatus");
  var toggleBtn = document.getElementById("botToggleEngineBtn");
  var logsTableBody = document.getElementById("botLogsTableBody");

  // Load Alpaca Keys
  function loadAlpacaKeys() {
    var keys = S.getAlpacaKeys();
    var envEl = document.getElementById("botAlpacaEnv");
    var modeInput = document.getElementById("botAlpacaMode");
    
    if (keys && keys.keyId) {
      if (envEl) {
        envEl.textContent = keys.env === "paper" ? "Paper Trading" : "Live Trading";
        envEl.className = keys.env === "paper" ? "status-positive" : "status-warning";
      }
      if (modeInput) modeInput.value = keys.env.toUpperCase();
      
      // Fetch account details
      var headers = { "APCA-API-KEY-ID": keys.keyId, "APCA-API-SECRET-KEY": keys.secret };
      fetch("/api/alpaca-account", { headers: headers })
        .then(function(r) { return r.json(); })
        .then(function(acct) {
          if (acct && acct.id) {
            var bp = document.getElementById("botAlpacaBp");
            var eq = document.getElementById("botAlpacaEq");
            if (bp) bp.value = D.formatMoney(parseFloat(acct.buying_power || 0));
            if (eq) eq.value = D.formatMoney(parseFloat(acct.equity || 0));
          }
        }).catch(function() {});
    } else {
      if (envEl) {
        envEl.textContent = "Not Configured";
        envEl.className = "status-negative";
      }
    }
  }

  // Toggle Engine
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      isEngineRunning = !isEngineRunning;
      if (isEngineRunning) {
        engineStatusEl.textContent = "Online";
        engineStatusEl.className = "status-positive";
        toggleBtn.textContent = "Stop Monitoring";
        toggleBtn.style.backgroundColor = "var(--red)";
        toggleBtn.style.borderColor = "var(--red)";
        S.toast("Trading Engine Started.", "success");
      } else {
        engineStatusEl.textContent = "Offline";
        engineStatusEl.className = "status-negative";
        toggleBtn.textContent = "Start Monitoring";
        toggleBtn.style.backgroundColor = "var(--green)";
        toggleBtn.style.borderColor = "var(--green)";
        S.toast("Trading Engine Stopped.", "error");
      }
    });
  }

  // Refresh Logs
  var refreshLogsBtn = document.getElementById("botRefreshLogsBtn");
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener("click", function() {
      if (logsTableBody) {
        logsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state" style="text-align: center; padding: 48px 0;">No logs retrieved for this session.</td></tr>';
      }
      S.toast("Ledger synced.", "info");
    });
  }

  // Initialize
  loadAlpacaKeys();
  if (logsTableBody) {
    setTimeout(function() {
      logsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state" style="text-align: center; padding: 48px 0;">No active logs in local ledger. Start the engine to stream trades.</td></tr>';
    }, 1000);
  }

})();
