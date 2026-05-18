/* site.js — Shared runtime for all canonical pages
   Loaded on every page via build-site.js script injection. */
(function () {
  "use strict";

  // ── Eastern-Time Clock ──
  function etNow() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  }

  function formatET(d) {
    const h = d.getHours(), m = d.getMinutes();
    const hh = h % 12 || 12;
    const mm = String(m).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    return `${hh}:${mm} ${ampm} ET`;
  }

  function marketPhase(d) {
    const day = d.getDay();
    if (day === 0 || day === 6) return { label: "Weekend", state: "closed" };
    const mins = d.getHours() * 60 + d.getMinutes();
    if (mins < 240) return { label: "Overnight", state: "closed" };
    if (mins < 570) return { label: "Pre-market", state: "premarket" };
    if (mins < 960) return { label: "Market open", state: "open" };
    if (mins < 1200) return { label: "After hours", state: "afterhours" };
    return { label: "Closed", state: "closed" };
  }

  function tickClock() {
    const now = etNow();
    const phase = marketPhase(now);
    document.querySelectorAll("[data-et-clock]").forEach(function (el) {
      el.textContent = formatET(now);
    });
    document.querySelectorAll("[data-session-label]").forEach(function (el) {
      el.textContent = phase.label;
    });
    document.querySelectorAll("[data-market-phase]").forEach(function (el) {
      el.textContent = phase.label;
    });
  }

  tickClock();
  requestAnimationFrame(function () { setInterval(tickClock, 15000); });

  // ── LocalStorage Helpers ──
  var KEYS = {
    SETUP: "dto_active_setup",
    SETUPS: "dto_saved_setups",
    WATCHLIST: "dto_watchlist",
    PORTFOLIO: "dto_paper_portfolio",
    REVIEWS: "dto_reviews",
    RULES: "dto_rules",
    ALERTS: "dto_alerts"
  };

  function readStore(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (e) { return fallback; }
  }
  function writeStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ── SQLite Write-Through ──
  // All writes go to localStorage first (fast sync), then to SQLite (async backup).
  function _dbPost(collection, item) {
    fetch('/api/data?collection=' + collection + '&action=upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    }).catch(function () {});
  }

  function _dbDelete(collection, id) {
    fetch('/api/data?collection=' + collection + '&action=delete&id=' + encodeURIComponent(id), {
      method: 'POST'
    }).catch(function () {});
  }

  // ── Active setup ──
  function getSetup() { return readStore(KEYS.SETUP, null); }
  function saveSetup(setup) {
    writeStore(KEYS.SETUP, setup);
    if (setup) _dbPost('setups', Object.assign({ id: 'active_setup_v1' }, setup));
  }

  // ── Saved setups list ──
  function getSavedSetups() { return readStore(KEYS.SETUPS, []); }
  function saveSetupToList(setup) {
    var list = getSavedSetups();
    setup.id = setup.id || Date.now().toString(36);
    setup.savedAt = new Date().toISOString();
    list.unshift(setup);
    if (list.length > 50) list = list.slice(0, 50);
    writeStore(KEYS.SETUPS, list);
    _dbPost('setups', setup);
    return setup;
  }
  function deleteSetupFromList(id) {
    writeStore(KEYS.SETUPS, getSavedSetups().filter(function (s) { return s.id !== id; }));
    _dbDelete('setups', id);
  }

  // ── Watchlist ──
  function getWatchlist() { return readStore(KEYS.WATCHLIST, []); }
  function addToWatchlist(symbol) {
    var list = getWatchlist();
    var clean = (symbol || "").toUpperCase().trim();
    if (!clean || list.includes(clean)) return list;
    list.unshift(clean);
    writeStore(KEYS.WATCHLIST, list);
    _dbPost('watchlist', { id: 'watchlist_v1', symbols: list });
    return list;
  }
  function removeFromWatchlist(symbol) {
    var list = getWatchlist().filter(function (s) { return s !== symbol; });
    writeStore(KEYS.WATCHLIST, list);
    _dbPost('watchlist', { id: 'watchlist_v1', symbols: list });
    return list;
  }

  // ── Paper portfolio ──
  function getPortfolio() {
    return readStore(KEYS.PORTFOLIO, { cash: 100000, positions: [], closed: [] });
  }
  function savePortfolio(p) {
    writeStore(KEYS.PORTFOLIO, p);
    _dbPost('portfolio', Object.assign({ id: 'portfolio_v1' }, p));
  }

  // ── Reviews ──
  function getReviews() { return readStore(KEYS.REVIEWS, []); }
  function saveReview(review) {
    var list = getReviews();
    review.id = review.id || Date.now().toString(36);
    review.savedAt = new Date().toISOString();
    list.unshift(review);
    if (list.length > 200) list = list.slice(0, 200);
    writeStore(KEYS.REVIEWS, list);
    _dbPost('reviews', review);
    return review;
  }

  // ── Rules ──
  function getRules() { return readStore(KEYS.RULES, []); }
  function saveRule(rule) {
    var list = getRules();
    rule.id = rule.id || Date.now().toString(36);
    rule.savedAt = new Date().toISOString();
    list.unshift(rule);
    if (list.length > 50) list = list.slice(0, 50);
    writeStore(KEYS.RULES, list);
    _dbPost('rules', rule);
    return rule;
  }

  // ── Alerts ──
  function getAlerts() { return readStore(KEYS.ALERTS, []); }
  function saveAlert(alert) {
    var list = getAlerts();
    alert.id = alert.id || Date.now().toString(36);
    alert.savedAt = new Date().toISOString();
    list.unshift(alert);
    writeStore(KEYS.ALERTS, list);
    _dbPost('alerts', alert);
    _updateAlertBadge();
    syncAlertsToServer();
    return alert;
  }
  function deleteAlert(id) {
    writeStore(KEYS.ALERTS, getAlerts().filter(function (a) { return a.id !== id; }));
    _dbDelete('alerts', id);
    _updateAlertBadge();
    syncAlertsToServer();
  }

  // ── Stackable Toast Notifications ──
  function toast(message, type, durationMs) {
    var stack = document.getElementById('toastStack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'site-toast' + (type ? ' ' + type : '');
    el.innerHTML =
      '<span class="toast-msg">' + message + '</span>' +
      '<button class="toast-dismiss" aria-label="Dismiss">&#215;</button>';
    stack.appendChild(el);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { el.classList.add('toast-visible'); });
    });
    var timer = setTimeout(function() { dismiss(el); }, durationMs || 4000);
    el.querySelector('.toast-dismiss').addEventListener('click', function() { dismiss(el); });
    function dismiss(t) {
      clearTimeout(timer);
      t.classList.add('toast-out');
      t.classList.remove('toast-visible');
      setTimeout(function() { if (t.parentNode) t.remove(); }, 280);
    }
  }

  // ── Global Modal ──
  function openModal(title, htmlContent) {
    var d = document.getElementById('globalModal');
    if (!d) return;
    document.getElementById('globalModalTitle').textContent = title || '';
    document.getElementById('globalModalBody').innerHTML = htmlContent || '';
    d.showModal();
  }
  function closeModal() {
    var d = document.getElementById('globalModal');
    if (d) d.close();
  }

  // ── Hash scroll ──
  function scrollToHash() {
    if (!location.hash) return;
    var target = document.querySelector(location.hash);
    if (target) setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 120);
  }
  window.addEventListener("load", scrollToHash);

  // ── Session info helper ──
  function sessionInfo() {
    var now = etNow();
    var phase = marketPhase(now);
    return { now: now, phase: phase, time: formatET(now) };
  }

  // ── Auth helpers ──
  var AUTH_KEY = "dto_auth_user";
  var ALPACA_KEY = "dto_alpaca_keys";

  function isLoggedIn() { return !!readStore(AUTH_KEY, null); }
  function currentUser() { return readStore(AUTH_KEY, null); }

  function loginUser(email, passHash) {
    var users = readStore("dto_users", {});
    if (users[email]) {
      if (users[email].passHash !== passHash) return { ok: false, error: "Wrong password." };
    } else {
      users[email] = { email: email, passHash: passHash, createdAt: new Date().toISOString() };
      writeStore("dto_users", users);
    }
    writeStore(AUTH_KEY, { email: email, loggedInAt: new Date().toISOString() });
    return { ok: true };
  }

  function logout() { localStorage.removeItem(AUTH_KEY); }

  function getAlpacaKeys() { return readStore(ALPACA_KEY, null); }
  function saveAlpacaKeys(keyId, secret, env) {
    writeStore(ALPACA_KEY, { keyId: keyId, secret: secret, env: env || "paper" });
  }

  function getPolyKeys() { return readStore("dto_poly_keys", null); }
  function savePolyKeys(apiKey, secret, passphrase) {
    writeStore("dto_poly_keys", { apiKey: apiKey, secret: secret, passphrase: passphrase });
  }

  // ── Update auth slot in top bar ──
  function updateAuthSlot() {
    var slot = document.getElementById("authSlot");
    if (!slot) return;
    var user = currentUser();
    if (user) {
      var initial = (user.email || "?")[0].toUpperCase();
      slot.innerHTML = '<a class="auth-avatar" href="login.html" title="' + user.email + '">' + initial + '</a>';
    } else {
      slot.innerHTML = '<a class="auth-link" href="login.html">Sign in</a>';
    }
  }
  updateAuthSlot();

  // ── Alert badge ──
  function _updateAlertBadge() {
    var count = getAlerts().length;
    var badge = document.getElementById("alertNavBadge");
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-flex" : "none";
  }

  // ── Sync alerts to server (for SSE polling) ──
  function syncAlertsToServer() {
    var alerts = getAlerts();
    if (!alerts.length) return;
    fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alerts: alerts })
    }).catch(function () {});
  }

  // ── SSE Alert Stream ──
  var _alertStream = null;
  function _connectAlertStream() {
    if (!window.EventSource || !getAlerts().length) return;
    if (_alertStream && _alertStream.readyState !== EventSource.CLOSED) return;
    _alertStream = new EventSource('/api/alerts/stream');
    _alertStream.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data);
        var msg = (data.symbol || '') + ' hit $' + (data.price ? data.price.toFixed(2) : '?');
        if (data.alerts && data.alerts.length) {
          msg = data.symbol + ' triggered ' + data.alerts.length + ' alert' + (data.alerts.length !== 1 ? 's' : '') + ' at $' + data.price.toFixed(2);
        }
        toast(msg, 'success');
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Price Alert — ' + (data.symbol || ''), { body: msg, icon: 'assets/icon.svg' });
        }
      } catch (e) {}
    };
    _alertStream.onerror = function () {
      _alertStream = null;
      setTimeout(_connectAlertStream, 30000);
    };
  }

  // ── Live Alert Checking (called from price stream callbacks) ──
  var firedAlerts = {};
  function checkAlerts(symbol, price) {
    var alerts = getAlerts();
    alerts.forEach(function (a) {
      if (a.symbol !== symbol || firedAlerts[a.id]) return;
      var triggered = false;
      if (a.direction === "above" && price >= a.price) triggered = true;
      if (a.direction === "below" && price <= a.price) triggered = true;
      if (triggered) {
        firedAlerts[a.id] = true;
        var msg = a.symbol + " hit " + a.direction + " $" + a.price + " (now $" + price.toFixed(2) + ")";
        toast(msg, "success");
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Price Alert — " + a.symbol, { body: msg, icon: "assets/icon.svg" });
        }
      }
    });
  }

  // Request notification permission on first interaction
  document.addEventListener("click", function requestNotif() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    document.removeEventListener("click", requestNotif);
  }, { once: true });

  // ── SQLite Hydration ──
  // On startup: if localStorage is empty, pull from SQLite to recover from browser clear.
  function _hydrateFromDb() {
    if (!getReviews().length) {
      fetch('/api/data?collection=reviews&action=list&limit=500')
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.ok && d.items.length) writeStore(KEYS.REVIEWS, d.items); })
        .catch(function () {});
    }
    if (!getRules().length) {
      fetch('/api/data?collection=rules&action=list&limit=200')
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.ok && d.items.length) writeStore(KEYS.RULES, d.items); })
        .catch(function () {});
    }
    if (!getSavedSetups().length) {
      fetch('/api/data?collection=setups&action=list&limit=200')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) return;
          var saved = d.items.filter(function (i) { return i.id !== 'active_setup_v1'; });
          if (saved.length) writeStore(KEYS.SETUPS, saved);
          var active = d.items.find(function (i) { return i.id === 'active_setup_v1'; });
          if (active && !getSetup()) writeStore(KEYS.SETUP, active);
        })
        .catch(function () {});
    }
    if (!getAlerts().length) {
      fetch('/api/data?collection=alerts&action=list&limit=200')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok && d.items.length) {
            writeStore(KEYS.ALERTS, d.items);
            _updateAlertBadge();
            syncAlertsToServer();
            _connectAlertStream();
          }
        })
        .catch(function () {});
    }
    if (!getWatchlist().length) {
      fetch('/api/data?collection=watchlist&action=get&id=watchlist_v1')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok && d.item && d.item.symbols && d.item.symbols.length) {
            writeStore(KEYS.WATCHLIST, d.item.symbols);
          }
        })
        .catch(function () {});
    }
    var p = getPortfolio();
    if (!p.positions.length && !p.closed.length) {
      fetch('/api/data?collection=portfolio&action=get&id=portfolio_v1')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok && d.item && (
            (d.item.positions && d.item.positions.length) ||
            (d.item.closed && d.item.closed.length)
          )) {
            writeStore(KEYS.PORTFOLIO, {
              cash: d.item.cash || 100000,
              positions: d.item.positions || [],
              closed: d.item.closed || []
            });
          }
        })
        .catch(function () {});
    }
  }

  // ── Modal close wiring ──
  var _gm = document.getElementById('globalModal');
  var _gmClose = document.getElementById('globalModalClose');
  if (_gm && _gmClose) {
    _gmClose.addEventListener('click', closeModal);
    _gm.addEventListener('click', function(e) { if (e.target === _gm) _gm.close(); });
  }

  // ── Startup ──
  _hydrateFromDb();
  _updateAlertBadge();
  _connectAlertStream();
  syncAlertsToServer();

  // ── Expose ──
  window.Site = {
    KEYS: KEYS,
    readStore: readStore,
    writeStore: writeStore,
    getSetup: getSetup,
    saveSetup: saveSetup,
    getSavedSetups: getSavedSetups,
    saveSetupToList: saveSetupToList,
    deleteSetupFromList: deleteSetupFromList,
    getWatchlist: getWatchlist,
    addToWatchlist: addToWatchlist,
    removeFromWatchlist: removeFromWatchlist,
    getPortfolio: getPortfolio,
    savePortfolio: savePortfolio,
    getReviews: getReviews,
    saveReview: saveReview,
    getRules: getRules,
    saveRule: saveRule,
    getAlerts: getAlerts,
    saveAlert: saveAlert,
    deleteAlert: deleteAlert,
    checkAlerts: checkAlerts,
    syncAlertsToServer: syncAlertsToServer,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    sessionInfo: sessionInfo,
    etNow: etNow,
    marketPhase: marketPhase,
    isLoggedIn: isLoggedIn,
    currentUser: currentUser,
    loginUser: loginUser,
    logout: logout,
    getAlpacaKeys: getAlpacaKeys,
    saveAlpacaKeys: saveAlpacaKeys,
    getPolyKeys: getPolyKeys,
    savePolyKeys: savePolyKeys
  };
})();
