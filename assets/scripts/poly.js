/* poly.js — Polymarket page runtime */
(function () {
  "use strict";
  var D = window.DTO, S = window.Site;

  var grid = document.getElementById("polyMarketGrid");
  var keyForm = document.getElementById("polyKeyForm");
  var statusEl = document.getElementById("polyApiStatus");

  function renderKeys() {
    var keys = S.getPolyKeys();
    if (keys && keys.apiKey) {
      if (statusEl) {
        statusEl.textContent = "Trading Enabled";
        statusEl.className = "status-positive";
      }
      var fKey = document.getElementById("polyApiKey");
      var fSec = document.getElementById("polyApiSecret");
      var fPass = document.getElementById("polyApiPassphrase");
      if (fKey) fKey.value = keys.apiKey;
      if (fSec) fSec.value = keys.secret;
      if (fPass) fPass.value = keys.passphrase;
    } else {
      if (statusEl) {
        statusEl.textContent = "Read-only";
        statusEl.className = "status-warning";
      }
    }
  }

  if (keyForm) {
    keyForm.addEventListener("submit", function(e) {
      e.preventDefault();
      var fKey = document.getElementById("polyApiKey").value.trim();
      var fSec = document.getElementById("polyApiSecret").value.trim();
      var fPass = document.getElementById("polyApiPassphrase").value.trim();
      
      if (fKey && fSec && fPass) {
        S.savePolyKeys(fKey, fSec, fPass);
        S.toast("Polymarket L2 keys saved locally.", "success");
        renderKeys();
      } else if (!fKey && !fSec && !fPass) {
        localStorage.removeItem(S.KEYS.POLY);
        S.toast("Polymarket keys cleared.", "info");
        renderKeys();
      } else {
        S.toast("All three fields are required to trade.", "error");
      }
    });
  }

  function fetchMarkets() {
    if (!grid) return;
    grid.innerHTML = '<div class="empty-state" style="padding: 48px 0; text-align: center;">Loading Polymarket events...</div>';
    
    fetch("/api/polymarket?action=markets&limit=12")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.ok) throw new Error(data.error || "Failed to load");
        
        var markets = data.markets || [];
        var countEl = document.getElementById("polyMarketCount");
        if (countEl) countEl.textContent = markets.length;
        
        if (!markets.length) {
          grid.innerHTML = '<div class="empty-state" style="padding: 48px 0; text-align: center;">No active liquid markets found right now.</div>';
          return;
        }

        grid.className = "lesson-grid"; // use the list layout
        grid.style.gridTemplateColumns = "1fr";
        
        grid.innerHTML = markets.map(function(m) {
          var yPrice = parseFloat(m.outcomePrices[0] || 0);
          var nPrice = parseFloat(m.outcomePrices[1] || 0);
          var vol = (m.volume || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
          
          return '<div class="surface" style="padding: 24px;">' +
                 '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">' +
                 '<div style="flex: 1;">' +
                 '<span class="eyebrow">' + D.escapeHtml(m.category) + ' · Vol: $' + vol + '</span>' +
                 '<h3 style="margin-top: 8px; font-size: 16px; font-weight: 500;">' + D.escapeHtml(m.question) + '</h3>' +
                 '</div>' +
                 '<div style="display: flex; gap: 8px; min-width: 140px; justify-content: flex-end;">' +
                 '<button class="secondary-btn" style="flex: 1; justify-content: center; background: rgba(24, 128, 56, 0.05); color: #188038; border-color: rgba(24, 128, 56, 0.2);">Yes ' + Math.round(yPrice * 100) + '¢</button>' +
                 '<button class="secondary-btn" style="flex: 1; justify-content: center; background: rgba(217, 48, 37, 0.05); color: #d93025; border-color: rgba(217, 48, 37, 0.2);">No ' + Math.round(nPrice * 100) + '¢</button>' +
                 '</div>' +
                 '</div>' +
                 '</div>';
        }).join("");
      })
      .catch(function(err) {
        grid.innerHTML = '<div class="empty-state" style="padding: 48px 0; text-align: center; color: var(--red);">Error loading markets: ' + D.escapeHtml(err.message) + '</div>';
      });
  }

  var refreshBtn = document.getElementById("polyRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", fetchMarkets);

  renderKeys();
  fetchMarkets();
})();
