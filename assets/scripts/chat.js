/* chat.js — Persistent AI Chat Assistant Widget */
(function() {
  'use strict';

  var STORAGE_KEY = 'dto-chat-v1';
  var MAX_MESSAGES = 40;

  var fab      = document.getElementById('aiChatFab');
  var panel    = document.getElementById('aiChatPanel');
  var closeBtn = document.getElementById('aiChatClose');
  var clearBtn = document.getElementById('aiChatClear');
  var form     = document.getElementById('aiChatForm');
  var input    = document.getElementById('aiChatInput');
  var msgList  = document.getElementById('aiChatMessages');
  var badge    = document.getElementById('aiChatProvider');

  if (!fab || !panel) return;

  var messages = [];
  var isOpen = false;
  var isBusy = false;

  /* ── Storage ── */
  function loadMessages() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveMessages() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES))); } catch (e) {}
  }

  /* ── Render ── */
  function addBubble(role, text) {
    var el = document.createElement('div');
    el.className = 'ai-chat-bubble ' + role;
    el.textContent = text;
    msgList.appendChild(el);
    msgList.scrollTop = msgList.scrollHeight;
    return el;
  }

  function renderAll() {
    msgList.innerHTML = '';
    if (messages.length === 0) {
      var hint = document.createElement('div');
      hint.className = 'ai-chat-bubble assistant';
      hint.textContent = 'Ask me anything about setups, risk, entries, or what the market is doing.';
      msgList.appendChild(hint);
      return;
    }
    messages.forEach(function(m) { addBubble(m.role, m.content); });
    msgList.scrollTop = msgList.scrollHeight;
  }

  /* ── Panel toggle ── */
  function open() {
    isOpen = true;
    panel.removeAttribute('hidden');
    requestAnimationFrame(function() { panel.classList.add('is-open'); });
    fab.classList.add('is-open');
    fab.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function close() {
    isOpen = false;
    panel.classList.remove('is-open');
    fab.classList.remove('is-open');
    fab.setAttribute('aria-expanded', 'false');
    setTimeout(function() { if (!isOpen) panel.setAttribute('hidden', ''); }, 270);
  }

  /* ── Send ── */
  function send() {
    var text = input.value.trim();
    if (!text || isBusy) return;
    isBusy = true;
    input.value = '';

    messages.push({ role: 'user', content: text });
    addBubble('user', text);

    var loadingEl = addBubble('loading', 'Thinking…');

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.slice(-20),
        context: window._chatContext || {}
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      loadingEl.remove();
      if (d.ok) {
        messages.push({ role: 'assistant', content: d.reply });
        saveMessages();
        addBubble('assistant', d.reply);
        if (badge && d.provider) {
          badge.textContent = d.provider === 'groq' ? 'Groq' : d.provider === 'ollama' ? 'Ollama' : 'Claude';
          badge.className = 'mini-chip buy';
        }
      } else {
        addBubble('error', d.error || 'AI unavailable.');
        if (window.Site && window.Site.toast) window.Site.toast('AI error: ' + (d.error || 'unavailable'), 'error');
      }
    })
    .catch(function(err) {
      loadingEl.remove();
      addBubble('error', 'Could not reach AI. Check your provider config.');
    })
    .finally(function() { isBusy = false; });
  }

  /* ── Clear ── */
  function clearChat() {
    messages = [];
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
    if (badge) { badge.textContent = 'Ready'; badge.className = 'mini-chip hold'; }
  }

  /* ── Init ── */
  messages = loadMessages();
  renderAll();

  fab.addEventListener('click', function() { isOpen ? close() : open(); });
  closeBtn.addEventListener('click', close);
  clearBtn.addEventListener('click', clearChat);
  form.addEventListener('submit', function(e) { e.preventDefault(); send(); });

  // Close on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) close();
  });
})();
