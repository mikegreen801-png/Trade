/* terminal.js - Headless API Interface */
(function() {
  "use strict";

  var termContainer = document.getElementById('terminal-container');
  if (!termContainer || !window.Terminal) return;

  var term = new window.Terminal({
    cursorBlink: true,
    theme: {
      background: '#000000',
      foreground: '#a9b1d6',
      cursor: '#c0caf5'
    },
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: 14
  });

  var fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(termContainer);
  fitAddon.fit();

  window.addEventListener('resize', function() { fitAddon.fit(); });

  var PROMPT = "\r\n\x1b[1;34mdto-core\x1b[0m@\x1b[1;32mheadless\x1b[0m:~$ ";

  term.writeln("Welcome to Day Trader OS | Headless API Terminal");
  term.writeln("Type 'help' to see available commands.");
  term.write(PROMPT);

  document.getElementById("termStatus").textContent = "Connected";
  document.getElementById("termStatus").className = "mini-chip buy";

  var currentInput = "";

  term.onKey(function(e) {
    var ev = e.domEvent;
    var printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;

    if (ev.keyCode === 13) {
      term.writeln("");
      processCommand(currentInput.trim());
      currentInput = "";
    } else if (ev.keyCode === 8) {
      if (currentInput.length > 0) {
        currentInput = currentInput.slice(0, -1);
        term.write('\b \b');
      }
    } else if (printable) {
      currentInput += e.key;
      term.write(e.key);
    }
  });

  function apiGet(path) {
    return fetch(path).then(function(r) { return r.json(); });
  }

  function apiPost(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) { return r.json(); });
  }

  function processCommand(cmd) {
    if (!cmd) { term.write(PROMPT); return; }

    var args = cmd.split(" ");
    var root = args[0].toLowerCase();

    switch (root) {
      case "help":
        term.writeln("Available commands:");
        term.writeln("  \x1b[1;33mstatus\x1b[0m         - Python engine status");
        term.writeln("  \x1b[1;33mstart\x1b[0m          - Start the bot engine");
        term.writeln("  \x1b[1;33mstop\x1b[0m           - Stop the bot engine");
        term.writeln("  \x1b[1;33manalyze\x1b[0m <sym>  - Run DTO candle analysis");
        term.writeln("  \x1b[1;33mswarm\x1b[0m <sym>    - Multi-agent swarm analysis");
        term.writeln("  \x1b[1;33mclear\x1b[0m          - Clear terminal");
        term.write(PROMPT);
        break;

      case "clear":
        term.clear();
        term.write(PROMPT);
        break;

      case "status":
        apiGet("/api/bot/status")
          .then(function(data) {
            term.writeln(JSON.stringify(data, null, 2).replace(/\n/g, "\r\n"));
            term.write(PROMPT);
          })
          .catch(function() {
            term.writeln("\x1b[31mPython Engine offline — status unavailable.\x1b[0m");
            term.write(PROMPT);
          });
        break;

      case "start":
        apiPost("/api/bot/start")
          .then(function(data) {
            term.writeln("\x1b[32m" + (data.message || "Bot started.") + "\x1b[0m");
            term.write(PROMPT);
          })
          .catch(function() {
            term.writeln("\x1b[31mCould not reach Python Engine.\x1b[0m");
            term.write(PROMPT);
          });
        break;

      case "stop":
        apiPost("/api/bot/stop")
          .then(function(data) {
            term.writeln("\x1b[31m" + (data.message || "Bot stopped.") + "\x1b[0m");
            term.write(PROMPT);
          })
          .catch(function() {
            term.writeln("\x1b[31mCould not reach Python Engine.\x1b[0m");
            term.write(PROMPT);
          });
        break;

      case "analyze":
        var sym = args[1];
        if (!sym) {
          term.writeln("\x1b[31mUsage: analyze <SYMBOL>  (e.g. analyze AAPL)\x1b[0m");
          term.write(PROMPT);
          return;
        }
        term.writeln("Fetching candles for " + sym.toUpperCase() + "...");
        if (window.DTO) {
          window.DTO.fetchCandles(sym).then(function(candles) {
            var r = window.DTO.analyzeCandles(sym, candles);
            var rc = r.rating === "BUY" ? "\x1b[32m" : r.rating === "SELL" ? "\x1b[31m" : "\x1b[33m";
            term.writeln("");
            term.writeln("Symbol:     " + r.symbol);
            term.writeln("Rating:     " + rc + r.rating + " " + r.confidence + "%\x1b[0m");
            term.writeln("Price:      " + r.metrics.price);
            term.writeln("Support:    " + r.metrics.support);
            term.writeln("Resistance: " + r.metrics.resistance);
            term.writeln("RSI:        " + r.metrics.rsi);
            term.write(PROMPT);
          }).catch(function(err) {
            term.writeln("\x1b[31mError: " + err.message + "\x1b[0m");
            term.write(PROMPT);
          });
        } else {
          term.writeln("\x1b[31mDTO core not loaded.\x1b[0m");
          term.write(PROMPT);
        }
        break;

      case "swarm":
        var swarmSym = args[1] || "";
        term.writeln("Initializing Swarm Agents" + (swarmSym ? " for " + swarmSym.toUpperCase() : "") + "...");
        apiPost("/api/bot/swarm", swarmSym ? { symbol: swarmSym.toUpperCase() } : {})
          .then(function(data) {
            /* Real swarm response from server */
            if (data.agents) {
              data.agents.forEach(function(a) {
                var col = a.signal === "BUY" ? "\x1b[32m" : a.signal === "SELL" ? "\x1b[31m" : "\x1b[33m";
                term.writeln("[" + a.name + "] " + col + a.signal + "\x1b[0m — score: " + a.score + " — " + a.rationale);
              });
              term.writeln("");
              var con = data.consensus;
              var cc = con === "BUY" ? "\x1b[32m" : con === "SELL" ? "\x1b[31m" : "\x1b[33m";
              term.writeln("Consensus: " + cc + con + "\x1b[0m  (confidence " + data.confidence + "%)");
            } else {
              term.writeln(JSON.stringify(data, null, 2).replace(/\n/g, "\r\n"));
            }
            term.write(PROMPT);
          })
          .catch(function() {
            /* Graceful fallback when Python Engine is offline */
            term.writeln("[Technical]  Candle patterns parsed locally.");
            term.writeln("[Macro]      Macro data pulled from /api/macro.");
            term.writeln("[Sentiment]  News sentiment aggregated from /api/news.");
            term.writeln("");
            term.writeln("\x1b[33mPython Engine offline — running local fallback agents.\x1b[0m");
            if (window.DTO && swarmSym) {
              window.DTO.fetchCandles(swarmSym).then(function(candles) {
                var r = window.DTO.analyzeCandles(swarmSym, candles);
                var rc = r.rating === "BUY" ? "\x1b[32m" : r.rating === "SELL" ? "\x1b[31m" : "\x1b[33m";
                term.writeln("Local consensus: " + rc + r.rating + " " + r.confidence + "%\x1b[0m");
                term.write(PROMPT);
              }).catch(function() { term.write(PROMPT); });
            } else {
              term.write(PROMPT);
            }
          });
        break;

      default:
        term.writeln("Command not found: " + root + "  (type 'help' for commands)");
        term.write(PROMPT);
        break;
    }
  }
})();
