/* redirect.js — Legacy redirect page runtime
   Reads window.__redirectTarget set by the build system,
   preserves current query params, and auto-redirects. */
(function () {
  "use strict";

  var target = window.__redirectTarget;
  if (!target) return;

  // Parse the target into base + hash
  var parts = target.split("#");
  var base = parts[0];
  var hash = parts[1] ? "#" + parts[1] : "";

  // Preserve current query params
  var currentParams = location.search || "";

  // Build final URL
  var separator = base.includes("?") ? "&" : "?";
  var finalUrl = base + (currentParams ? separator + currentParams.slice(1) : "") + hash;

  // Update the manual link
  var link = document.querySelector(".primary-btn[href]");
  if (link) link.href = finalUrl;

  // Countdown and redirect
  var note = document.querySelector(".footer-note");
  var countdown = 2;

  function tick() {
    if (countdown <= 0) {
      location.replace(finalUrl);
      return;
    }
    if (note) note.textContent = "Redirecting in " + countdown + " second" + (countdown === 1 ? "" : "s") + "…";
    countdown--;
    setTimeout(tick, 1000);
  }

  tick();
})();
