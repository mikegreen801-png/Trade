(function () {
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-dto-open-auth]");
    if (trigger) {
      event.preventDefault();
      setTimeout(() => window.DTO?.openAuthModal?.(trigger.dataset.dtoOpenAuth || "signup"), 0);
      return;
    }
    const logout = event.target.closest("[data-dto-logout]");
    if (logout && window.DTO?.activeUser) {
      event.preventDefault();
      localStorage.removeItem("dtoActiveUser");
      window.dispatchEvent(new CustomEvent("dto:user-changed"));
    }
  });

  const page = location.pathname.split(/[\\/]/).pop() || "index.html";
  const SETUP_KEY = "dtoSetupPacket";
  const LAST_SETUP_KEY = "dtoLastSetup";
  const SETUPS_KEY = "dtoSetupPackets";
  const HISTORY_KEY = "dtoTradeHistory";
  const USERS_KEY = "dtoUsers";
  const ACTIVE_USER_KEY = "dtoActiveUser";

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  function simpleHash(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `demo-${(hash >>> 0).toString(16)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function cleanSymbol(value) {
    return String(value || "AAPL").trim().toUpperCase().replace(/^BINANCE:/, "").replace(/[^A-Z0-9.-]/g, "") || "AAPL";
  }

  function number(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(String(value).replace(/[$,%R]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 2 : 4)}`;
  }

  function pct(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(0)}%` : "--";
  }

  function assetTypeFor(symbol) {
    return /^(BTC|ETH|SOL|DOGE|XRP|BNB|ADA|AVAX|LINK|SUI|PEPE|SHIB|LTC|BCH|[A-Z0-9]{2,12}(USDT|USD))$/i.test(cleanSymbol(symbol))
      ? "crypto"
      : "stock";
  }

  function normalizeExperience(value) {
    const mode = String(value || "beginner").toLowerCase();
    if (mode.includes("expert")) return "expert";
    if (mode.includes("pro") || mode.includes("intermediate")) return "pro";
    return "beginner";
  }

  function users() {
    return readJson(USERS_KEY, []);
  }

  function activeUser() {
    const id = localStorage.getItem(ACTIVE_USER_KEY);
    return users().find(user => user.id === id) || null;
  }

  function userDisplayName(user = activeUser()) {
    if (!user) return "";
    return user.name || user.username || user.email || "Trader";
  }

  function profileMode(user = activeUser()) {
    return normalizeExperience(user?.experience);
  }

  function saveUserProfile(user) {
    const list = users();
    const next = [user, ...list.filter(item => item.id !== user.id && item.username !== user.username && item.email !== user.email)].slice(0, 20);
    writeJson(USERS_KEY, next);
    localStorage.setItem(ACTIVE_USER_KEY, user.id);
    window.dispatchEvent(new CustomEvent("dto:user-changed", { detail: user }));
    return user;
  }

  function signupUser(formData) {
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");
    const experience = normalizeExperience(formData.get("experience"));
    const focus = String(formData.get("focus") || "").trim();
    if (!email || !phone || !name || !username || password.length < 6) {
      throw new Error("Fill name, email, phone, username, and a 6+ character password.");
    }
    const duplicate = users().find(user => user.email === email || String(user.username || "").toLowerCase() === username.toLowerCase());
    if (duplicate) throw new Error("That email or username already exists in this browser.");
    return saveUserProfile({
      id: `user-${Date.now()}`,
      email,
      phone,
      name,
      username,
      passwordHash: simpleHash(password),
      experience,
      focus,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    });
  }

  function loginUser(formData) {
    const login = String(formData.get("login") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const user = users().find(item => item.email === login || String(item.username || "").toLowerCase() === login);
    if (!user || user.passwordHash !== simpleHash(password)) {
      throw new Error("Login did not match a saved account in this browser.");
    }
    user.lastLoginAt = new Date().toISOString();
    return saveUserProfile(user);
  }

  function logoutUser() {
    localStorage.removeItem(ACTIVE_USER_KEY);
    window.dispatchEvent(new CustomEvent("dto:user-changed"));
  }

  function normalizeSetup(raw) {
    const setup = raw || {};
    const symbol = cleanSymbol(setup.symbol || setup.ticker || new URLSearchParams(location.search).get("symbol") || "AAPL");
    const entry = number(setup.entry ?? setup.price);
    const stop = number(setup.stop);
    const target = number(setup.target);
    const rr = number(setup.rr) ?? (entry && stop && target && entry !== stop ? Math.abs(target - entry) / Math.abs(entry - stop) : null);
    return {
      id: setup.id || `setup-${Date.now()}`,
      symbol,
      assetType: setup.assetType || assetTypeFor(symbol),
      side: String(setup.side || setup.dir || "long").toLowerCase().includes("short") ? "short" : "long",
      rating: String(setup.rating || "CHECK").toUpperCase(),
      entry,
      stop,
      target,
      support: number(setup.support),
      resistance: number(setup.resistance),
      rr,
      confidence: number(setup.confidence),
      timeframe: setup.timeframe || "intraday",
      thesis: setup.thesis || setup.notes || "",
      catalysts: Array.isArray(setup.catalysts) ? setup.catalysts : String(setup.catalysts || "").split("|").filter(Boolean),
      riskNotes: Array.isArray(setup.riskNotes) ? setup.riskNotes : String(setup.riskNotes || "").split("|").filter(Boolean),
      sourcePage: setup.sourcePage || setup.source || page,
      createdAt: setup.createdAt || setup.updatedAt || new Date().toISOString()
    };
  }

  function setupFromQuery() {
    const params = new URLSearchParams(location.search);
    if (!params.get("symbol")) return null;
    return normalizeSetup(Object.fromEntries(params.entries()));
  }

  function getSetup() {
    return setupFromQuery() || readJson(SETUP_KEY, null) || readJson(LAST_SETUP_KEY, null);
  }

  function saveSetup(raw, options = {}) {
    const setup = normalizeSetup(raw || getSetup() || {});
    writeJson(SETUP_KEY, setup);
    writeJson(LAST_SETUP_KEY, setup);
    if (options.addToHistory !== false) {
      const list = readJson(SETUPS_KEY, []);
      const next = [setup, ...list.filter(item => item.id !== setup.id)].slice(0, 30);
      writeJson(SETUPS_KEY, next);
    }
    window.dispatchEvent(new CustomEvent("dto:setup-saved", { detail: setup }));
    return setup;
  }

  function workflowParams(setup) {
    const params = new URLSearchParams();
    ["symbol", "assetType", "side", "rating", "entry", "stop", "target", "support", "resistance", "rr", "confidence", "timeframe"].forEach(key => {
      if (setup[key] !== null && setup[key] !== undefined && setup[key] !== "") params.set(key, setup[key]);
    });
    if (setup.thesis) params.set("thesis", setup.thesis.slice(0, 700));
    return params.toString();
  }

  function workflowUrl(target, rawSetup = getSetup()) {
    const setup = normalizeSetup(rawSetup || {});
    return `${target}?${workflowParams(setup)}`;
  }

  function gradeSetup(raw) {
    const setup = normalizeSetup(raw || getSetup() || {});
    let score = 50;
    const notes = [];
    const warnings = [];
    const rr = number(setup.rr);
    const conf = number(setup.confidence);
    const entry = number(setup.entry);
    const stop = number(setup.stop);
    const target = number(setup.target);
    const support = number(setup.support);
    const resistance = number(setup.resistance);

    if (setup.rating.includes("BUY") || setup.rating.includes("SELL")) { score += 10; notes.push("Directional signal is actionable enough to plan, not blindly enter."); }
    if (setup.rating.includes("HOLD") || setup.rating.includes("CHECK") || setup.rating.includes("WAIT")) { score -= 3; warnings.push("Rating still needs confirmation before execution."); }
    if (rr !== null && rr >= 2) { score += 18; notes.push(`Reward/risk is ${rr.toFixed(2)}R, which clears the 2R planning bar.`); }
    if (rr !== null && rr < 2) { score -= 16; warnings.push(`Reward/risk is only ${rr.toFixed(2)}R. Tighten stop, improve target, or skip.`); }
    if (conf !== null && conf >= 70) score += 8;
    if (conf !== null && conf < 55) { score -= 8; warnings.push("Confidence is weak; keep this paper-only until the chart improves."); }
    if (entry && stop && entry !== stop) score += 8; else warnings.push("Entry and stop are missing, so risk cannot be controlled.");
    if (entry && target && entry !== target) score += 6; else warnings.push("Target is missing, so reward cannot be judged.");
    if (support && resistance && entry) {
      score += 6;
      const nearResistance = Math.abs(resistance - entry) / entry < 0.006;
      const nearSupport = Math.abs(entry - support) / entry < 0.006;
      if (setup.side === "long" && nearResistance) warnings.push("Long setup is close to resistance; chasing may be inefficient.");
      if (setup.side === "short" && nearSupport) warnings.push("Short setup is close to support; downside may be crowded.");
      if (nearSupport || nearResistance) score -= 5;
    } else {
      warnings.push("Support/resistance map is incomplete.");
    }
    if (setup.thesis && setup.thesis.length > 80) { score += 5; notes.push("Thesis has enough context to review later."); }
    if (setup.catalysts.length) score += 4; else warnings.push("No catalyst is attached; check headlines, earnings, macro, and sector/crypto beta.");

    score = Math.max(0, Math.min(100, Math.round(score)));
    const label = score >= 80 ? "A Setup" : score >= 68 ? "B Setup" : score >= 55 ? "C Setup" : "Paper Only";
    const modeText = {
      beginner: score >= 68 ? "This is structured enough to practice. Still confirm the chart and risk before entering." : "This needs more proof. Use it as a learning example or paper trade only.",
      pro: `${label}: ${warnings[0] || notes[0] || "Review levels, catalyst, and liquidity before sizing."}`,
      expert: `Score ${score}/100. RR ${rr === null ? "--" : rr.toFixed(2)}R, confidence ${conf === null ? "--" : conf}, asset ${setup.assetType}.`
    };
    return { score, label, notes, warnings, setup, modeText };
  }

  function readPaperAccount() {
    return readJson("dtoPaperTradingAccount", { cash: 100000, startingCash: 100000, positions: [], log: [], realized: 0, quotes: {} });
  }

  function journalTrades() {
    return readJson("trades", []).map(item => ({
      id: `journal-${item.id}`,
      source: "journal",
      symbol: item.ticker,
      side: item.dir,
      qty: item.shares,
      entry: item.entry,
      exit: item.exit,
      pnl: number(item.pnl) || 0,
      setupType: item.setup,
      mistake: item.emotion,
      notes: item.notes,
      closedAt: item.date || new Date().toISOString()
    }));
  }

  function paperTrades() {
    return (readPaperAccount().log || []).map((item, index) => ({
      id: `paper-${index}-${item.time}`,
      source: "paper",
      symbol: item.symbol,
      side: item.action,
      qty: item.qty,
      entry: item.price,
      pnl: number(item.pnl),
      closedAt: item.time
    }));
  }

  function tradeHistory() {
    return [...readJson(HISTORY_KEY, []), ...journalTrades(), ...paperTrades()]
      .sort((a, b) => new Date(b.closedAt || b.time || 0) - new Date(a.closedAt || a.time || 0))
      .slice(0, 100);
  }

  function recordTrade(raw) {
    const trade = { id: raw.id || `trade-${Date.now()}`, closedAt: raw.closedAt || new Date().toISOString(), ...raw };
    const list = [trade, ...readJson(HISTORY_KEY, []).filter(item => item.id !== trade.id)].slice(0, 100);
    writeJson(HISTORY_KEY, list);
    window.dispatchEvent(new CustomEvent("dto:trade-recorded", { detail: trade }));
    return trade;
  }

  function missionStats() {
    const setup = getSetup();
    const grade = setup ? gradeSetup(setup) : null;
    const user = activeUser();
    const paper = readPaperAccount();
    const history = tradeHistory();
    const journal = journalTrades();
    const openPnl = (paper.positions || []).reduce((sum, p) => {
      const last = paper.quotes?.[p.symbol]?.price || p.entry || 0;
      return sum + (last - p.entry) * p.qty * (p.side === "short" ? -1 : 1);
    }, 0);
    const closed = history.filter(t => Number.isFinite(number(t.pnl)));
    const net = closed.reduce((sum, t) => sum + (number(t.pnl) || 0), 0);
    const wins = closed.filter(t => (number(t.pnl) || 0) > 0).length;
    return {
      setup,
      grade,
      user,
      profileMode: profileMode(user),
      paper,
      history,
      journalCount: journal.length,
      openPositions: (paper.positions || []).length,
      openPnl,
      net,
      winRate: closed.length ? wins / closed.length * 100 : null,
      savedSetups: readJson(SETUPS_KEY, [])
    };
  }

  function renderMissionControl(target = document.getElementById("missionControl")) {
    if (!target) return;
    const stats = missionStats();
    const setup = stats.setup;
    const grade = stats.grade;
    const saved = stats.savedSetups.slice(0, 5);
    const recent = stats.history.slice(0, 5);
    const gradeWarnings = grade?.warnings?.slice(0, 3) || [];
    const gradeNotes = grade?.notes?.slice(0, 2) || [];
    const user = stats.user;
    const mode = stats.profileMode;
    const modeLabel = mode === "expert" ? "Expert" : mode === "pro" ? "Pro" : "Beginner";
    const personalizedRead = !user
      ? "Create a profile so the OS can change explanations, blockers, and next actions around your experience level."
      : mode === "expert"
        ? "Expert mode: compact readouts, faster execution checks, and fewer definitions. Focus stays on edge, liquidity, risk, and review stats."
        : mode === "pro"
          ? "Pro mode: balanced coaching with faster checklists. You still get blockers when R:R, catalyst, or levels are weak."
          : "Beginner mode: the OS slows the workflow down, explains weak setups, and keeps questionable ideas paper-first.";
    const gradeNext = !setup
      ? "Create or save a setup first."
      : grade?.score >= 68
        ? "Next: open Risk, confirm position size, then paper trade before going live."
        : "Next: improve R:R, confirm catalyst, tighten levels, or keep it paper-only.";
    const gradeNoteHtml = gradeWarnings.length || gradeNotes.length
      ? [
          ...gradeWarnings.map(item => `<div class="dto-grade-note">${escapeHtml(item)}</div>`),
          ...gradeNotes.map(item => `<div class="dto-grade-note good">${escapeHtml(item)}</div>`)
        ].slice(0, 4).join("")
      : `<div class="dto-grade-note">Save a setup to generate specific strengths, blockers, and next actions.</div>`;
    target.innerHTML = `
      <div class="dto-mission-grid">
        <article class="dto-mission-panel dto-active-setup">
          <div class="dto-panel-kicker">Active Setup Packet</div>
          <h3>${setup ? escapeHtml(setup.symbol) : "No Active Setup"}</h3>
          <p>${setup ? escapeHtml(setup.thesis || "Setup saved. Add thesis/catalyst before execution.") : "Search a ticker or open Guided Trade Builder to create the first setup packet."}</p>
          <div class="dto-chip-row">
            <span>${setup ? escapeHtml(setup.side.toUpperCase()) : "WAITING"}</span>
            <span>${setup ? escapeHtml(setup.rating) : "NO RATING"}</span>
            <span>${setup?.rr ? `${Number(setup.rr).toFixed(2)}R` : "R:R --"}</span>
          </div>
          <div class="dto-action-row">
            <a href="${setup ? workflowUrl("trade_planner.html", setup) : "trade_planner.html"}">Plan</a>
            <a href="${setup ? workflowUrl("execution_workbench.html", setup) : "execution_workbench.html"}">Risk</a>
            <a href="${setup ? workflowUrl("practice_workbench.html", setup) : "practice_workbench.html"}">Paper</a>
          </div>
        </article>
        <article class="dto-mission-panel">
          <div class="dto-panel-kicker">Setup Grader</div>
          <div class="dto-grade-panel">
            <div class="dto-score-ring" style="--score:${grade?.score || 0}"><div><strong>${grade?.score ?? "--"}</strong><span>${grade ? "Score" : "No Grade"}</span></div></div>
            <div class="dto-grade-summary">
              <strong>${grade ? escapeHtml(grade.label) : "No Grade"}</strong>
              <small>${grade ? escapeHtml(grade.modeText[mode] || grade.modeText.pro) : "Save a setup to grade trend, levels, reward/risk, and catalyst quality."}</small>
            </div>
          </div>
          <div class="dto-grade-breakdown">
            <div class="dto-grade-item"><span>Symbol</span><strong>${setup ? escapeHtml(setup.symbol) : "--"}</strong></div>
            <div class="dto-grade-item"><span>Bias</span><strong>${setup ? escapeHtml(setup.rating || "CHECK") : "--"}</strong></div>
            <div class="dto-grade-item"><span>R:R</span><strong>${setup?.rr ? Number(setup.rr).toFixed(2) + "R" : "--"}</strong></div>
            <div class="dto-grade-item"><span>Next Action</span><strong>${escapeHtml(gradeNext)}</strong></div>
          </div>
          <div class="dto-grade-notes">${gradeNoteHtml}</div>
        </article>
        <article class="dto-mission-panel">
          <div class="dto-panel-kicker">Paper Account</div>
          <h3>${money((stats.paper.cash || 0) + stats.openPnl)}</h3>
          <p>Open P&L ${money(stats.openPnl)} / ${stats.openPositions} open positions.</p>
          <div class="dto-action-row"><a href="practice_workbench.html">Open Practice</a><a href="broker_execution_plan.html">Locked Broker Plan</a></div>
        </article>
        <article class="dto-mission-panel">
          <div class="dto-panel-kicker">Journal Edge</div>
          <h3>${pct(stats.winRate)}</h3>
          <p>${stats.journalCount} journal trades. Aggregated P&L ${money(stats.net)}.</p>
          <div class="dto-action-row"><a href="review_workbench.html">Review Room</a><a href="trade_review_coach.html">Review Coach</a></div>
        </article>
        <article class="dto-mission-panel">
          <div class="dto-panel-kicker">Personal Feedback</div>
          <h3>${user ? escapeHtml(modeLabel) : "Profile"}</h3>
          <p>${escapeHtml(personalizedRead)}</p>
          <div class="dto-chip-row">
            <span>${user ? escapeHtml(userDisplayName(user)) : "No Login"}</span>
            <span>${escapeHtml(modeLabel)}</span>
          </div>
          <div class="dto-action-row">
            ${user ? `<button type="button" data-dto-open-auth="profile">Edit Profile</button><button type="button" data-dto-logout>Log Out</button>` : `<button type="button" data-dto-open-auth="signup">Sign Up</button><button type="button" data-dto-open-auth="login">Log In</button>`}
          </div>
        </article>
      </div>
      <div class="dto-mission-lists">
        <article class="dto-mission-panel">
          <div class="dto-panel-kicker">Saved Setups</div>
          ${saved.length ? saved.map(item => `<button class="dto-list-row" data-dto-load-setup="${escapeHtml(item.id)}"><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(item.rating || "CHECK")} / ${item.rr ? Number(item.rr).toFixed(2) + "R" : "R:R --"}</span></button>`).join("") : `<p>No saved setups yet.</p>`}
        </article>
        <article class="dto-mission-panel">
          <div class="dto-panel-kicker">Recent Trade History</div>
          ${recent.length ? recent.map(item => `<div class="dto-list-row"><strong>${escapeHtml(item.symbol || "--")}</strong><span>${escapeHtml(item.source || "trade")} / ${money(item.pnl)}</span></div>`).join("") : `<p>No trade history yet. Start with paper trades, then journal the result.</p>`}
        </article>
      </div>`;
    target.querySelectorAll("[data-dto-load-setup]").forEach(button => {
      button.addEventListener("click", () => {
        const match = readJson(SETUPS_KEY, []).find(item => item.id === button.dataset.dtoLoadSetup);
        if (match) {
          saveSetup(match, { addToHistory: false });
          renderMissionControl(target);
        }
      });
    });
    target.querySelectorAll("[data-dto-open-auth]").forEach(button => {
      button.addEventListener("click", () => openAuthModal(button.dataset.dtoOpenAuth));
    });
    target.querySelectorAll("[data-dto-logout]").forEach(button => {
      button.addEventListener("click", () => {
        logoutUser();
        renderMissionControl(target);
        renderAuthControls();
      });
    });
  }

  function currentSetupFromPage() {
    const query = setupFromQuery();
    if (query) return query;
    const symbolField = document.getElementById("assetInput") || document.getElementById("symbol") || document.getElementById("ticker");
    const setup = getSetup() || {};
    if (symbolField?.value) setup.symbol = symbolField.value;
    ["entry", "price", "stop", "target", "support", "resistance"].forEach(id => {
      const el = document.getElementById(id);
      if (el?.value) setup[id === "price" ? "entry" : id] = el.value;
    });
    setup.sourcePage = page;
    return normalizeSetup(setup);
  }

  function injectHomeLink() {
    if (page !== "index.html" && !document.querySelector(".dto-home-link")) {
      const link = document.createElement("a");
      link.className = "dto-home-link";
      link.href = "index.html";
      link.innerHTML = '<span class="dto-home-mark" aria-hidden="true">&larr;</span><span>Return Home</span>';
      document.body.appendChild(link);
    }
    document.querySelectorAll(".dto-home-link").forEach(link => {
      link.href = "index.html";
      link.setAttribute("aria-label", "Return to Day Trader OS home");
      link.innerHTML = '<span class="dto-home-mark" aria-hidden="true">&larr;</span><span>Return Home</span>';
    });
  }

  function injectGlobalActions() {
    if (document.querySelector(".dto-global-actions")) return;
    const bar = document.createElement("nav");
    bar.className = "dto-global-actions";
    bar.setAttribute("aria-label", "Day Trader OS workflow actions");
    bar.innerHTML = `
      <button type="button" data-dto-action="save">Save Setup</button>
      <button type="button" data-dto-action="theme">Toggle Theme</button>
      ${page !== "execution_workbench.html" ? `<a data-dto-link="risk" href="execution_workbench.html">Open in Risk</a>` : ''}
      ${page !== "practice_workbench.html" ? `<a data-dto-link="paper" href="practice_workbench.html">Paper Trade</a>` : ''}
      ${page !== "review_workbench.html" ? `<a data-dto-link="journal" href="review_workbench.html">Journal Result</a>` : ''}
      <a data-dto-home-action href="${page === "index.html" ? "#home" : "index.html"}">${page === "index.html" ? "Back to Top" : "Back to Home"}</a>`;
    document.body.appendChild(bar);
    bar.querySelector('[data-dto-action="save"]').addEventListener("click", () => {
      const setup = saveSetup(currentSetupFromPage());
      renderMissionControl();
      bar.querySelector('[data-dto-action="save"]').textContent = `${setup.symbol} Saved`;
      setTimeout(() => { bar.querySelector('[data-dto-action="save"]').textContent = "Save Setup"; }, 1400);
      updateGlobalLinks();
    });
    bar.querySelector('[data-dto-action="theme"]').addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("dtoTheme", next);
    });
    const homeAction = bar.querySelector("[data-dto-home-action]");
    if (page === "index.html" && homeAction) {
      homeAction.addEventListener("click", event => {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    updateGlobalLinks();
  }

  function updateGlobalLinks() {
    const setup = getSetup();
    document.querySelectorAll('[data-dto-link="risk"]').forEach(a => { a.href = setup ? workflowUrl("execution_workbench.html", setup) : "execution_workbench.html"; });
    document.querySelectorAll('[data-dto-link="paper"]').forEach(a => { a.href = setup ? workflowUrl("practice_workbench.html", setup) : "practice_workbench.html"; });
    document.querySelectorAll('[data-dto-link="journal"]').forEach(a => { a.href = setup ? workflowUrl("review_workbench.html", setup) : "review_workbench.html"; });
  }

  function authStatusText(user = activeUser()) {
    if (!user) return "Profile saves locally until a production database is connected.";
    const mode = profileMode(user);
    const modeLabel = mode === "expert" ? "Expert" : mode === "pro" ? "Pro" : "Beginner";
    return `${userDisplayName(user)} / ${modeLabel} feedback mode`;
  }

  function renderAuthControls() {
    const bars = document.querySelectorAll(".dto-auth-bar, .dto-auth-inline");
    if (!bars.length) return;
    const user = activeUser();
    const html = user
      ? `<span>${escapeHtml(userDisplayName(user))}</span><button type="button" data-dto-open-auth="profile">Profile</button><button type="button" data-dto-logout>Log Out</button>`
      : `<button type="button" data-dto-open-auth="signup">Sign Up</button><button type="button" data-dto-open-auth="login">Log In</button>`;
    bars.forEach(bar => {
      bar.innerHTML = html;
      bar.querySelectorAll("[data-dto-open-auth]").forEach(button => {
        button.addEventListener("click", () => openAuthModal(button.dataset.dtoOpenAuth));
      });
      bar.querySelectorAll("[data-dto-logout]").forEach(button => {
        button.addEventListener("click", () => {
          logoutUser();
          renderAuthControls();
          renderMissionControl();
        });
      });
    });
  }

  function injectAuthControls() {
    const headerTarget = document.querySelector(".top-right") || document.querySelector(".topbar");
    if (headerTarget && !document.querySelector(".dto-auth-inline")) {
      const inline = document.createElement("div");
      inline.className = "dto-auth-inline";
      inline.setAttribute("aria-label", "Account controls");
      const session = headerTarget.querySelector(".session");
      if (session) headerTarget.insertBefore(inline, session);
      else headerTarget.appendChild(inline);
    }
    if (!headerTarget && !document.querySelector(".dto-auth-bar")) {
      const bar = document.createElement("div");
      bar.className = "dto-auth-bar";
      bar.setAttribute("aria-label", "Account controls");
      document.body.appendChild(bar);
    }
    if (!document.getElementById("dtoAuthModal")) {
      const modal = document.createElement("div");
      modal.id = "dtoAuthModal";
      modal.className = "dto-auth-modal";
      modal.setAttribute("hidden", "");
      modal.innerHTML = `
        <div class="dto-auth-scrim" data-dto-close-auth></div>
        <section class="dto-auth-panel" role="dialog" aria-modal="true" aria-labelledby="dtoAuthTitle">
          <button class="dto-auth-close" type="button" data-dto-close-auth>Close</button>
          <div id="dtoAuthContent"></div>
        </section>`;
      document.body.appendChild(modal);
      modal.querySelectorAll("[data-dto-close-auth]").forEach(button => {
        button.addEventListener("click", closeAuthModal);
      });
    }
    renderAuthControls();
  }

  function experienceOptions(selected) {
    const value = normalizeExperience(selected);
    return [
      ["beginner", "Beginner"],
      ["pro", "Pro / Intermediate"],
      ["expert", "Expert"]
    ].map(([key, label]) => `<option value="${key}"${value === key ? " selected" : ""}>${label}</option>`).join("");
  }

  function authFormHtml(mode) {
    const user = activeUser();
    if (mode === "login") {
      return `
        <div class="dto-auth-head">
          <div class="dto-panel-kicker">Account Access</div>
          <h2 id="dtoAuthTitle">Log In</h2>
          <p>${escapeHtml(authStatusText(null))}</p>
        </div>
        <form class="dto-auth-form" data-dto-auth-form="login">
          <label>Email or Username<input name="login" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <button type="submit" class="dto-auth-submit">Log In</button>
          <button type="button" class="dto-auth-switch" data-dto-open-auth="signup">Need an account? Sign Up</button>
          <div class="dto-auth-message" data-dto-auth-message></div>
        </form>`;
    }
    if (mode === "profile" && user) {
      return `
        <div class="dto-auth-head">
          <div class="dto-panel-kicker">Personal Feedback</div>
          <h2 id="dtoAuthTitle">Edit Profile</h2>
          <p>${escapeHtml(authStatusText(user))}</p>
        </div>
        <form class="dto-auth-form" data-dto-auth-form="profile">
          <div class="dto-auth-grid">
            <label>Name<input name="name" value="${escapeHtml(user.name)}" required></label>
            <label>Username<input name="username" value="${escapeHtml(user.username)}" required></label>
            <label>Email<input name="email" type="email" value="${escapeHtml(user.email)}" required></label>
            <label>Phone<input name="phone" type="tel" value="${escapeHtml(user.phone)}" required></label>
            <label>Experience<select name="experience">${experienceOptions(user.experience)}</select></label>
            <label>New Password<input name="password" type="password" autocomplete="new-password" placeholder="Leave blank to keep current"></label>
            <label class="dto-auth-wide">Feedback Focus<textarea name="focus" rows="3" placeholder="Examples: options hedging, scalping, beginner basics, risk control">${escapeHtml(user.focus || "")}</textarea></label>
          </div>
          <div class="dto-auth-grid" style="margin-top:16px; border-top:1px solid rgba(0,217,255,0.1); padding-top:16px;">
            <label>Alpaca API Key ID<input name="alpacaApiKey" value="${escapeHtml(user.alpacaApiKey || "")}" placeholder="PK..."></label>
            <label>Alpaca API Secret<input name="alpacaApiSecret" type="password" value="${escapeHtml(user.alpacaApiSecret || "")}" placeholder="Leave blank to keep current secret if saved"></label>
            <label>Trading Mode<select name="alpacaMode">
              <option value="paper"${user.alpacaMode !== "live" ? " selected" : ""}>Paper Trading</option>
              <option value="live"${user.alpacaMode === "live" ? " selected" : ""}>Live Trading (Real Money)</option>
            </select></label>
          </div>
          <div class="dto-auth-grid" style="margin-top:16px; border-top:1px solid rgba(0,217,255,0.1); padding-top:16px;">
            <div style="grid-column:1/-1; font-size:0.7em; color:var(--dto-cyan); letter-spacing:2px; margin-bottom:8px;">POLYMARKET L2 API</div>
            <label>API Key<input name="polyApiKey" value="${escapeHtml(user.polyApiKey || "")}" placeholder="Polymarket L2 key"></label>
            <label>API Secret<input name="polyApiSecret" type="password" placeholder="Leave blank to keep current"></label>
            <label>Passphrase<input name="polyPassphrase" type="password" placeholder="Leave blank to keep current"></label>
            <label style="grid-column:1/-1">Funder Address<input name="polyFunderAddress" value="${escapeHtml(user.polyFunderAddress || "")}" placeholder="0x... (Polygon wallet address)"></label>
          </div>
          <button type="submit" class="dto-auth-submit">Save Profile</button>
          <div class="dto-auth-message" data-dto-auth-message></div>
        </form>`;
    }
    return `
      <div class="dto-auth-head">
        <div class="dto-panel-kicker">Create Trader Profile</div>
        <h2 id="dtoAuthTitle">Sign Up</h2>
        <p>Choose your experience level so setup grades, warnings, and coaching feedback match how you trade.</p>
      </div>
      <form class="dto-auth-form" data-dto-auth-form="signup">
        <div class="dto-auth-grid">
          <label>Name<input name="name" autocomplete="name" required></label>
          <label>Username<input name="username" autocomplete="username" required></label>
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Phone<input name="phone" type="tel" autocomplete="tel" required></label>
          <label>Password<input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
          <label>Experience<select name="experience">${experienceOptions("beginner")}</select></label>
          <label class="dto-auth-wide">Feedback Focus<textarea name="focus" rows="3" placeholder="What should the OS coach you on? Risk, psychology, options, chart reading, crypto, etc."></textarea></label>
        </div>
        <button type="submit" class="dto-auth-submit">Create Profile</button>
        <button type="button" class="dto-auth-switch" data-dto-open-auth="login">Already have one? Log In</button>
        <div class="dto-auth-message" data-dto-auth-message></div>
      </form>`;
  }

  function openAuthModal(mode = "signup") {
    injectAuthControls();
    const modal = document.getElementById("dtoAuthModal");
    const content = document.getElementById("dtoAuthContent");
    if (!modal || !content) return;
    content.innerHTML = authFormHtml(mode);
    modal.removeAttribute("hidden");
    modal.querySelectorAll("[data-dto-open-auth]").forEach(button => {
      button.addEventListener("click", () => openAuthModal(button.dataset.dtoOpenAuth));
    });
    const form = content.querySelector("[data-dto-auth-form]");
    form?.addEventListener("submit", event => {
      event.preventDefault();
      const message = form.querySelector("[data-dto-auth-message]");
      try {
        const formData = new FormData(form);
        const kind = form.dataset.dtoAuthForm;
        let user;
        if (kind === "login") {
          user = loginUser(formData);
        } else if (kind === "profile") {
          const current = activeUser();
          if (!current) throw new Error("Log in before editing a profile.");
          const email = String(formData.get("email") || "").trim().toLowerCase();
          const username = String(formData.get("username") || "").trim();
          const duplicate = users().find(item => item.id !== current.id && (item.email === email || String(item.username || "").toLowerCase() === username.toLowerCase()));
          if (duplicate) throw new Error("That email or username is already used in this browser.");
          user = {
            ...current,
            email,
            username,
            phone: String(formData.get("phone") || "").trim(),
            name: String(formData.get("name") || "").trim(),
            experience: normalizeExperience(formData.get("experience")),
            focus: String(formData.get("focus") || "").trim(),
            alpacaApiKey: String(formData.get("alpacaApiKey") || "").trim(),
            alpacaMode: String(formData.get("alpacaMode") || "paper"),
            updatedAt: new Date().toISOString()
          };
          const alpacaSecret = String(formData.get("alpacaApiSecret") || "").trim();
          if (alpacaSecret) user.alpacaApiSecret = alpacaSecret;
          user.polyApiKey = String(formData.get("polyApiKey") || "").trim();
          user.polyFunderAddress = String(formData.get("polyFunderAddress") || "").trim();
          const polySecret = String(formData.get("polyApiSecret") || "").trim();
          if (polySecret) user.polyApiSecret = polySecret;
          const polyPassphrase = String(formData.get("polyPassphrase") || "").trim();
          if (polyPassphrase) user.polyPassphrase = polyPassphrase;
          const password = String(formData.get("password") || "");
          if (password) {
            if (password.length < 6) throw new Error("New password must be at least 6 characters.");
            user.passwordHash = simpleHash(password);
          }
          user = saveUserProfile(user);
        } else {
          user = signupUser(formData);
        }
        if (message) {
          message.className = "dto-auth-message good";
          message.textContent = `${userDisplayName(user)} is active. Feedback is now ${profileMode(user)} mode.`;
        }
        renderAuthControls();
        renderMissionControl();
        setTimeout(closeAuthModal, 650);
      } catch (error) {
        if (message) {
          message.className = "dto-auth-message bad";
          message.textContent = error.message || "Account action failed.";
        }
      }
    });
    content.querySelector("input, select, textarea")?.focus();
  }

  function closeAuthModal() {
    const modal = document.getElementById("dtoAuthModal");
    modal?.setAttribute("hidden", "");
  }

  function injectSignalNote() {
    if (page === "signal_dashboard.html" && !document.querySelector(".dto-signal-note")) {
      const main = document.querySelector(".main");
      if (main) {
        const note = document.createElement("div");
        note.className = "dto-signal-note";
        note.textContent = "Live signal cards use browser-accessible candle feeds and technical levels. Verify with your broker before trading.";
        main.insertAdjacentElement("afterbegin", note);
      }
    }
  }

  function injectUnifiedTheme() {
    document.documentElement.classList.add("dto-unified");
    if (document.getElementById("dto-unified-theme")) return;
    const style = document.createElement("style");
    style.id = "dto-unified-theme";
    style.textContent = `
/* ── DTO UNIFIED THEME — default: clean light, toggle: dark ── */

html.dto-unified {
  color-scheme: light;
  --bg:    #f5f5f7;
  --panel: #ffffff;
  --panel2:#f5f5f7;
  --line:  rgba(0,0,0,0.06);
  --text:  #1d1d1f;
  --muted: #6e6e73;
  --cyan:  #0066ff;
  --green: #00c805;
  --gold:  #ff9500;
  --red:   #ff3b30;
  --dto-bg:      #f5f5f7;
  --dto-panel:   #ffffff;
  --dto-panel-2: #f5f5f7;
  --dto-border:  rgba(0,0,0,0.06);
  --dto-text:    #1d1d1f;
  --dto-muted:   #6e6e73;
  --dto-cyan:    #0066ff;
  --dto-green:   #00c805;
  --dto-gold:    #ff9500;
  --dto-red:     #ff3b30;
}

html.dto-unified[data-theme="dark"] {
  color-scheme: dark;
  --bg:    #0c0f14;
  --panel: #151a22;
  --panel2:#1c2230;
  --line:  rgba(255,255,255,0.08);
  --text:  #e8edf5;
  --muted: #8494a8;
  --cyan:  #00d7ff;
  --green: #00e08a;
  --gold:  #f2b84b;
  --red:   #ff5b6e;
  --dto-bg:      #0c0f14;
  --dto-panel:   #151a22;
  --dto-panel-2: #1c2230;
  --dto-border:  rgba(255,255,255,0.08);
  --dto-text:    #e8edf5;
  --dto-muted:   #8494a8;
  --dto-cyan:    #00d7ff;
  --dto-green:   #00e08a;
  --dto-gold:    #f2b84b;
  --dto-red:     #ff5b6e;
}

html.dto-unified *,
html.dto-unified *::before,
html.dto-unified *::after { box-sizing: border-box; }

/* ── LIGHT BODY (default) ── */
html.dto-unified body {
  min-height: 100vh;
  background: var(--bg, #f5f5f7) !important;
  color: var(--text, #1d1d1f) !important;
  font-family: -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif !important;
  letter-spacing: 0 !important;
}

/* ── DARK BODY ── */
html.dto-unified[data-theme="dark"] body {
  background:
    radial-gradient(circle at 80% 10%, rgba(0,224,138,0.07), transparent 38%),
    var(--bg, #0c0f14) !important;
  color: var(--text, #e8edf5) !important;
  font-family: -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif !important;
}

html.dto-unified main,
html.dto-unified .main,
html.dto-unified .wrap,
html.dto-unified .shell,
html.dto-unified .container,
html.dto-unified .page {
  color: var(--text);
}

/* ── HEADINGS — clean, no ALL-CAPS ── */
html.dto-unified h1,
html.dto-unified .title,
html.dto-unified .symbol,
html.dto-unified .hero-title {
  color: var(--text) !important;
  font-family: "Barlow Condensed", system-ui, sans-serif !important;
  font-weight: 800 !important;
  letter-spacing: -0.01em !important;
  line-height: 0.92 !important;
  text-transform: none !important;
}

html.dto-unified h2,
html.dto-unified h3,
html.dto-unified h4,
html.dto-unified .section-title,
html.dto-unified .panel-title {
  color: var(--text);
  letter-spacing: -0.01em;
  text-transform: none;
  font-family: -apple-system, "SF Pro Display", "Inter", system-ui, sans-serif;
}

/* ── KICKER / LABEL — muted, not neon ── */
html.dto-unified .kicker,
html.dto-unified .eyebrow,
html.dto-unified .tool-kicker,
html.dto-unified .panel-kicker,
html.dto-unified .dto-panel-kicker {
  color: var(--muted) !important;
  font-weight: 600;
  font-size: 0.68em;
  letter-spacing: 0.06em !important;
  text-transform: uppercase;
  font-family: -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif !important;
}

html.dto-unified p,
html.dto-unified li,
html.dto-unified small,
html.dto-unified .note,
html.dto-unified .sub,
html.dto-unified .hint,
html.dto-unified .muted {
  color: var(--muted);
}

/* ── CARDS / PANELS (default = white) ── */
html.dto-unified .panel,
html.dto-unified .card,
html.dto-unified .hero-card,
html.dto-unified .tool,
html.dto-unified .resource,
html.dto-unified .op,
html.dto-unified .metric,
html.dto-unified .widget-box,
html.dto-unified .company-card,
html.dto-unified .status-card,
html.dto-unified .check,
html.dto-unified .path-step,
html.dto-unified .scanner-card,
html.dto-unified .module,
html.dto-unified section.panel,
html.dto-unified article {
  border: 1px solid var(--line) !important;
  border-radius: 12px !important;
  background: var(--panel) !important;
  color: var(--text) !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.04);
}

/* ── CARDS dark override ── */
html.dto-unified[data-theme="dark"] .panel,
html.dto-unified[data-theme="dark"] .card,
html.dto-unified[data-theme="dark"] .hero-card,
html.dto-unified[data-theme="dark"] .tool,
html.dto-unified[data-theme="dark"] .resource,
html.dto-unified[data-theme="dark"] .op,
html.dto-unified[data-theme="dark"] .metric,
html.dto-unified[data-theme="dark"] .widget-box,
html.dto-unified[data-theme="dark"] .company-card,
html.dto-unified[data-theme="dark"] .status-card,
html.dto-unified[data-theme="dark"] .check,
html.dto-unified[data-theme="dark"] .path-step,
html.dto-unified[data-theme="dark"] .scanner-card,
html.dto-unified[data-theme="dark"] .module,
html.dto-unified[data-theme="dark"] section.panel,
html.dto-unified[data-theme="dark"] article {
  background: var(--panel) !important;
  color: var(--text) !important;
  border-color: var(--line) !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.28);
}

html.dto-unified .tool.featured,
html.dto-unified .primary-card,
html.dto-unified .result-card {
  border-color: rgba(0,200,5,0.25) !important;
  box-shadow: 0 0 0 1px rgba(0,200,5,0.12) !important;
}

/* ── INPUTS (default = white) ── */
html.dto-unified input,
html.dto-unified select,
html.dto-unified textarea {
  border: 1px solid rgba(0,0,0,0.12) !important;
  border-radius: 8px !important;
  background: #ffffff !important;
  color: #1d1d1f !important;
  font-family: -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif !important;
  font-weight: 400;
  outline: none;
}

html.dto-unified[data-theme="dark"] input,
html.dto-unified[data-theme="dark"] select,
html.dto-unified[data-theme="dark"] textarea {
  border-color: rgba(255,255,255,0.12) !important;
  background: rgba(255,255,255,0.06) !important;
  color: var(--text) !important;
}

html.dto-unified input:focus,
html.dto-unified select:focus,
html.dto-unified textarea:focus {
  border-color: var(--cyan, #0066ff) !important;
  box-shadow: 0 0 0 3px rgba(0,102,255,0.12) !important;
}

html.dto-unified[data-theme="dark"] input:focus,
html.dto-unified[data-theme="dark"] select:focus,
html.dto-unified[data-theme="dark"] textarea:focus {
  box-shadow: 0 0 0 3px rgba(0,215,255,0.15) !important;
}

/* ── BUTTONS (default = clean outlined) ── */
html.dto-unified button,
html.dto-unified .btn,
html.dto-unified .flow-btn,
html.dto-unified .ground-link,
html.dto-unified .tool-link,
html.dto-unified .action,
html.dto-unified a.button {
  border: 1px solid rgba(0,0,0,0.1) !important;
  border-radius: 8px !important;
  background: #ffffff !important;
  color: #1d1d1f !important;
  cursor: pointer;
  font-family: -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif !important;
  font-weight: 500 !important;
  letter-spacing: 0 !important;
  text-decoration: none !important;
  text-transform: none !important;
  transition: background .14s ease, border-color .14s ease, transform .1s ease !important;
}

html.dto-unified[data-theme="dark"] button,
html.dto-unified[data-theme="dark"] .btn,
html.dto-unified[data-theme="dark"] .flow-btn,
html.dto-unified[data-theme="dark"] .action,
html.dto-unified[data-theme="dark"] a.button {
  border-color: rgba(255,255,255,0.12) !important;
  background: rgba(255,255,255,0.07) !important;
  color: var(--text) !important;
}

html.dto-unified button:hover,
html.dto-unified .btn:hover,
html.dto-unified .flow-btn:hover,
html.dto-unified .action:hover {
  background: #f5f5f7 !important;
  border-color: rgba(0,0,0,0.18) !important;
}

html.dto-unified[data-theme="dark"] button:hover,
html.dto-unified[data-theme="dark"] .btn:hover,
html.dto-unified[data-theme="dark"] .flow-btn:hover,
html.dto-unified[data-theme="dark"] .action:hover {
  background: rgba(255,255,255,0.12) !important;
  border-color: rgba(255,255,255,0.2) !important;
}

html.dto-unified button:active,
html.dto-unified .btn:active,
html.dto-unified .flow-btn:active,
html.dto-unified .action:active {
  transform: scale(0.96) !important;
}

/* ── PRIMARY BUTTON — Robinhood green ── */
html.dto-unified button.primary,
html.dto-unified .btn.primary,
html.dto-unified .flow-btn.primary,
html.dto-unified .primary {
  background: #00c805 !important;
  border-color: transparent !important;
  color: #ffffff !important;
  font-weight: 600 !important;
  box-shadow: 0 1px 3px rgba(0,200,5,0.22) !important;
}

html.dto-unified button.primary:hover,
html.dto-unified .btn.primary:hover,
html.dto-unified .primary:hover {
  filter: brightness(1.06) !important;
  background: #00c805 !important;
  box-shadow: 0 2px 10px rgba(0,200,5,0.32) !important;
}

/* ── STATUS COLORS ── */
html.dto-unified .gold,
html.dto-unified .warning,
html.dto-unified .status-note,
html.dto-unified .dto-warning,
html.dto-unified .blocker {
  border-color: rgba(255,149,0,0.25) !important;
  background: rgba(255,149,0,0.07) !important;
  color: #a85800 !important;
}

html.dto-unified[data-theme="dark"] .gold,
html.dto-unified[data-theme="dark"] .warning,
html.dto-unified[data-theme="dark"] .status-note,
html.dto-unified[data-theme="dark"] .blocker {
  color: var(--gold) !important;
  background: rgba(242,184,75,0.09) !important;
  border-color: rgba(242,184,75,0.28) !important;
}

html.dto-unified .sell, html.dto-unified .danger,
html.dto-unified .loss, html.dto-unified .red { color: var(--red) !important; }

html.dto-unified .buy, html.dto-unified .gain,
html.dto-unified .green { color: var(--green) !important; }

/* ── TABLES ── */
html.dto-unified table {
  width: 100%;
  border-collapse: collapse;
  border-radius: 8px;
  overflow: hidden;
}

html.dto-unified th {
  color: var(--muted);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 500;
  border-bottom: 1px solid var(--line);
  padding: 9px 12px;
  font-family: -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif;
}

html.dto-unified td {
  color: var(--text);
  border-bottom: 1px solid var(--line);
  padding: 10px 12px;
  font-family: -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif;
}

html.dto-unified ::selection {
  background: rgba(0,102,255,0.2);
  color: inherit;
}

@media (max-width: 800px) {
  html.dto-unified .dto-mission-grid { grid-template-columns: 1fr !important; }
  html.dto-unified .dto-mission-lists { grid-template-columns: 1fr !important; }
  html.dto-unified .dto-action-row { flex-wrap: wrap; }
  html.dto-unified .dto-global-actions {
    flex-wrap: wrap; justify-content: center;
    padding: 6px !important; gap: 4px !important;
  }
  html.dto-unified .dto-global-actions button,
  html.dto-unified .dto-global-actions a { padding: 6px 10px !important; font-size: 11px !important; }
  html.dto-unified .dto-auth-inline span { display: none; }
  html.dto-unified .top-right, html.dto-unified .topbar { gap: 8px !important; }
  html.dto-unified main, html.dto-unified .shell, html.dto-unified .wrap {
    padding: 10px !important; padding-bottom: 80px !important;
  }
  html.dto-unified table { display: block; overflow-x: auto; white-space: nowrap; }
  html.dto-unified .hero-title { font-size: 2.5rem !important; }
}
`;
    document.head.appendChild(style);
  }

  function syncQuerySetup() {
    const setup = setupFromQuery();
    if (setup) saveSetup(setup, { addToHistory: false });
  }

  window.DTO = {
    readJson,
    writeJson,
    normalizeSetup,
    getSetup,
    saveSetup,
    workflowUrl,
    gradeSetup,
    renderMissionControl,
    activeUser,
    profileMode,
    openAuthModal,
    tradeHistory,
    recordTrade,
    missionStats,
    money,
    escapeHtml
  };

  const savedTheme = localStorage.getItem("dtoTheme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);

  syncQuerySetup();
  injectUnifiedTheme();
  injectGlobalActions();
  injectHomeLink();
  injectSignalNote();
  injectAuthControls();

  // ── Alert System (real-time, WebSocket-powered) ──
  let _alertStreamCleanup = [];

  function startAlertSystem() {
    _alertStreamCleanup.forEach(fn => fn());
    _alertStreamCleanup = [];

    const alerts = readJson("dtoAlerts", []);
    if (!alerts.length) return;

    const bySymbol = {};
    alerts.forEach(a => {
      if (!a.symbol || !a.price) return;
      (bySymbol[a.symbol] = bySymbol[a.symbol] || []).push(a);
    });

    for (const [sym, symAlerts] of Object.entries(bySymbol)) {
      const onPrice = (price) => {
        symAlerts.forEach(a => {
          const hit = (a.direction === 'above' && price >= a.price) ||
                      (a.direction === 'below' && price <= a.price);
          if (hit) triggerBrowserNotification(sym, price, a);
        });
      };

      let streamed = false;
      if (window.streamCryptoPrice) {
        const ws = window.streamCryptoPrice(sym, onPrice);
        if (ws) {
          streamed = true;
          _alertStreamCleanup.push(() => { if (window.stopStream) window.stopStream(sym); });
        }
      }
      if (!streamed && window.streamStockPrice) {
        window.streamStockPrice(sym, onPrice);
        _alertStreamCleanup.push(() => { if (window.stopStream) window.stopStream(sym); });
      }
    }
  }

  function triggerBrowserNotification(symbol, price, alert) {
    const title = `${symbol} Alert: $${price}`;
    const body = `${alert.trigger} ${alert.level ? 'near ' + alert.level : ''}. ${alert.note || ''}`;
    
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}

    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  window.addEventListener('storage', event => {
    if (event.key === 'dtoAlerts') startAlertSystem();
  });

  document.addEventListener('click', () => {
    if (Notification.permission === 'default') Notification.requestPermission();
  }, { once: true });

  startAlertSystem();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      renderMissionControl();
      updateGlobalLinks();
      renderAuthControls();
    });
  } else {
    renderMissionControl();
    updateGlobalLinks();
    renderAuthControls();
  }

  // Check if this deployed site is specifically configured as a Live Site via .env
  fetch('/api/health').then(r => r.json()).then(data => {
    const mainTitle = document.querySelector('.hero-copy h1');
    if (data && data.siteMode === 'live') {
      document.body.classList.add('dto-live-site-mode');
      if (window.alpacaAPI) window.alpacaAPI.liveMode = true;
      if (mainTitle) mainTitle.textContent = 'Live Command Center';
      
      const banner = document.createElement('div');
      banner.className = 'dto-live-banner';
      banner.innerHTML = '⚠️ DEDICATED LIVE TRADING DOMAIN ⚠️ Real money execution active.';
      document.body.insertBefore(banner, document.body.firstChild);
    } else {
      if (mainTitle) mainTitle.textContent = 'Paper Command Center';
    }
  }).catch(() => {
    const mainTitle = document.querySelector('.hero-copy h1');
    if (mainTitle) mainTitle.textContent = 'Paper Command Center';
  });
})();
