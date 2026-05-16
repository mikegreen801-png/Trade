/**
 * dto-animations.js — Ripple clicks, card stagger, number counters
 * Pure progressive enhancement — no dependencies, no framework.
 */

(function () {

  // ── Ripple on click ──────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    const target = e.target.closest(
      'button, .cat-tab, .action, .nav-links a, ' +
      '.dto-primary-btn, .dto-action-btn, .flow-btn, .card-btn, .modal-btn'
    );
    if (!target) return;

    target.classList.add('ripple-host');
    const rect = target.getBoundingClientRect();
    const wave = document.createElement('span');
    wave.className = 'dto-ripple-wave';

    const isPrimary = target.matches(
      '.primary, .dto-primary-btn, [class*="primary"], .cat-tab.active'
    );
    wave.style.cssText =
      'left:' + (e.clientX - rect.left - 12) + 'px;' +
      'top:'  + (e.clientY - rect.top  - 12) + 'px;' +
      'background:' + (isPrimary ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.07)') + ';';

    target.appendChild(wave);
    wave.addEventListener('animationend', function () { wave.remove(); });
  });

  // ── Stagger children entrance ────────────────────────────────────────────
  function staggerChildren(container) {
    if (!container) return;
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      const delay = Math.min(i, 5);
      el.classList.add(delay === 0 ? 'dto-enter' : 'dto-enter-d' + delay);
    }
  }
  window.dtoStagger = staggerChildren;

  // ── Animate probability bars ─────────────────────────────────────────────
  function animateBars(container) {
    if (!container) return;
    const bars = container.querySelectorAll('.bar-fill[data-target]');
    // Use two rAF passes so the browser has rendered width:0 first
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        bars.forEach(function (bar) {
          bar.style.width = bar.dataset.target + '%';
        });
      });
    });
  }
  window.dtoAnimateBars = animateBars;

  // ── Number count-up ──────────────────────────────────────────────────────
  function animateNumber(el, to, opts) {
    opts = opts || {};
    const prefix   = opts.prefix   || '';
    const suffix   = opts.suffix   || '';
    const decimals = opts.decimals != null ? opts.decimals : 2;
    const duration = opts.duration || 600;
    const from = parseFloat(el.dataset.animFrom || 0);
    el.dataset.animFrom = to;

    const start = performance.now();
    function tick(now) {
      const p    = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3); // cubic ease-out
      const val  = from + (to - from) * ease;
      el.textContent = prefix + val.toFixed(decimals) + suffix;
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = prefix + to.toFixed(decimals) + suffix;
        el.classList.add('dto-num-update');
        el.addEventListener('animationend', function () {
          el.classList.remove('dto-num-update');
        }, { once: true });
      }
    }
    requestAnimationFrame(tick);
  }
  window.dtoAnimateNumber = animateNumber;

  // ── Page fade-in on load ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('dto-page-ready');
  });

})();
