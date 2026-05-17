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
  setInterval(tickClock, 15000);

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

  // Active setup
  function getSetup() { return readStore(KEYS.SETUP, null); }
  function saveSetup(setup) { writeStore(KEYS.SETUP, setup); }

  // Saved setups list
  function getSavedSetups() { return readStore(KEYS.SETUPS, []); }
  function saveSetupToList(setup) {
    var list = getSavedSetups();
    setup.id = setup.id || Date.now().toString(36);
    setup.savedAt = new Date().toISOString();
    list.unshift(setup);
    if (list.length > 50) list = list.slice(0, 50);
    writeStore(KEYS.SETUPS, list);
    return setup;
  }
  function deleteSetupFromList(id) {
    writeStore(KEYS.SETUPS, getSavedSetups().filter(function (s) { return s.id !== id; }));
  }

  // Watchlist
  function getWatchlist() { return readStore(KEYS.WATCHLIST, []); }
  function addToWatchlist(symbol) {
    var list = getWatchlist();
    var clean = (symbol || "").toUpperCase().trim();
    if (!clean || list.includes(clean)) return list;
    list.unshift(clean);
    writeStore(KEYS.WATCHLIST, list);
    return list;
  }
  function removeFromWatchlist(symbol) {
    var list = getWatchlist().filter(function (s) { return s !== symbol; });
    writeStore(KEYS.WATCHLIST, list);
    return list;
  }

  // Paper portfolio
  function getPortfolio() {
    return readStore(KEYS.PORTFOLIO, { cash: 100000, positions: [], closed: [] });
  }
  function savePortfolio(p) { writeStore(KEYS.PORTFOLIO, p); }

  // Reviews
  function getReviews() { return readStore(KEYS.REVIEWS, []); }
  function saveReview(review) {
    var list = getReviews();
    review.id = review.id || Date.now().toString(36);
    review.savedAt = new Date().toISOString();
    list.unshift(review);
    if (list.length > 200) list = list.slice(0, 200);
    writeStore(KEYS.REVIEWS, list);
    return review;
  }

  // Rules
  function getRules() { return readStore(KEYS.RULES, []); }
  function saveRule(rule) {
    var list = getRules();
    rule.id = rule.id || Date.now().toString(36);
    rule.savedAt = new Date().toISOString();
    list.unshift(rule);
    if (list.length > 50) list = list.slice(0, 50);
    writeStore(KEYS.RULES, list);
    return rule;
  }

  // Alerts
  function getAlerts() { return readStore(KEYS.ALERTS, []); }
  function saveAlert(alert) {
    var list = getAlerts();
    alert.id = alert.id || Date.now().toString(36);
    alert.savedAt = new Date().toISOString();
    list.unshift(alert);
    writeStore(KEYS.ALERTS, list);
    return alert;
  }
  function deleteAlert(id) {
    writeStore(KEYS.ALERTS, getAlerts().filter(function (a) { return a.id !== id; }));
  }

  // ── Toast Notification ──
  function toast(message, type) {
    var el = document.createElement("div");
    el.className = "site-toast " + (type || "info");
    el.textContent = message;
    el.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:100;" +
      "padding:12px 20px;border-radius:14px;font:600 14px/1.4 var(--font-ui);" +
      "background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-2);" +
      "color:var(--text);opacity:0;transition:opacity .2s ease;max-width:400px;text-align:center;";
    if (type === "success") el.style.borderColor = "var(--green)";
    if (type === "error") el.style.borderColor = "var(--red)";
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = "1"; });
    setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 250);
    }, 2400);
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

  function isLoggedIn() {
    return !!readStore(AUTH_KEY, null);
  }

  function currentUser() {
    return readStore(AUTH_KEY, null);
  }

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

  function logout() {
    localStorage.removeItem(AUTH_KEY);
  }

  function getAlpacaKeys() {
    return readStore(ALPACA_KEY, null);
  }

  function saveAlpacaKeys(keyId, secret, env) {
    writeStore(ALPACA_KEY, { keyId: keyId, secret: secret, env: env || "paper" });
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
    toast: toast,
    sessionInfo: sessionInfo,
    etNow: etNow,
    marketPhase: marketPhase,
    isLoggedIn: isLoggedIn,
    currentUser: currentUser,
    loginUser: loginUser,
    logout: logout,
    getAlpacaKeys: getAlpacaKeys,
    saveAlpacaKeys: saveAlpacaKeys
  };
})();
