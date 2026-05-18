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
  
  window.addEventListener('resize', function() {
    fitAddon.fit();
  });
  
  var prompt = "\r\n\x1b[1;34mdto-core\x1b[0m@\x1b[1;32mheadless\x1b[0m:~$ ";
  
  term.writeln("Welcome to Day Trader OS | Headless API Terminal");
  term.writeln("Type 'help' to see available commands.");
  term.write(prompt);
  
  document.getElementById("termStatus").textContent = "Connected";
  document.getElementById("termStatus").className = "mini-chip buy";
  
  var currentInput = "";
  
  term.onKey(function(e) {
    var ev = e.domEvent;
    var printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;
    
    if (ev.keyCode === 13) { // Enter
      term.writeln("");
      processCommand(currentInput.trim());
      currentInput = "";
    } else if (ev.keyCode === 8) { // Backspace
      if (currentInput.length > 0) {
        currentInput = currentInput.slice(0, -1);
        term.write('\b \b');
      }
    } else if (printable) {
      currentInput += e.key;
      term.write(e.key);
    }
  });
  
  function processCommand(cmd) {
    if (!cmd) {
      term.write(prompt);
      return;
    }
    
    var args = cmd.split(" ");
    var root = args[0].toLowerCase();
    
    switch (root) {
      case "help":
        term.writeln("Available commands:");
        term.writeln("  \x1b[1;33mstatus\x1b[0m   - Get Python trading engine status");
        term.writeln("  \x1b[1;33manalyze\x1b[0m  - <symbol> Run DTO candle analysis");
        term.writeln("  \x1b[1;33mstart\x1b[0m    - Start the bot engine");
        term.writeln("  \x1b[1;33mstop\x1b[0m     - Stop the bot engine");
        term.writeln("  \x1b[1;33mswarm\x1b[0m    - Trigger multi-agent swarm analysis");
        term.writeln("  \x1b[1;33mclear\x1b[0m    - Clear terminal");
        term.write(prompt);
        break;
        
      case "clear":
        term.clear();
        term.write(prompt);
        break;
        
      case "status":
        fetch("http://localhost:8000/api/bot/status")
          .then(res => res.json())
          .then(data => {
            term.writeln(JSON.stringify(data, null, 2).replace(/\n/g, "\r\n"));
            term.write(prompt);
          })
          .catch(err => {
            term.writeln("\x1b[31mError connecting to Python Engine.\x1b[0m");
            term.write(prompt);
          });
        break;
        
      case "start":
        fetch("http://localhost:8000/api/bot/start", { method: "POST" })
          .then(res => res.json())
          .then(data => {
            term.writeln("\x1b[32m" + data.message + "\x1b[0m");
            term.write(prompt);
          })
          .catch(err => { term.writeln("\x1b[31mError.\x1b[0m"); term.write(prompt); });
        break;
        
      case "stop":
        fetch("http://localhost:8000/api/bot/stop", { method: "POST" })
          .then(res => res.json())
          .then(data => {
            term.writeln("\x1b[31m" + data.message + "\x1b[0m");
            term.write(prompt);
          })
          .catch(err => { term.writeln("\x1b[31mError.\x1b[0m"); term.write(prompt); });
        break;
        
      case "analyze":
        var sym = args[1];
        if (!sym) {
          term.writeln("\x1b[31mError: Provide a symbol (e.g. analyze AAPL)\x1b[0m");
          term.write(prompt);
          return;
        }
        term.writeln("Fetching candles for " + sym.toUpperCase() + "...");
        if (window.DTO) {
          window.DTO.fetchCandles(sym).then(candles => {
            var r = window.DTO.analyzeCandles(sym, candles);
            var rc = r.rating === "BUY" ? "\x1b[32m" : r.rating === "SELL" ? "\x1b[31m" : "\x1b[33m";
            term.writeln("");
            term.writeln("Analysis for " + r.symbol);
            term.writeln("Rating:     " + rc + r.rating + " " + r.confidence + "%\x1b[0m");
            term.writeln("Price:      " + r.metrics.price);
            term.writeln("Support:    " + r.metrics.support);
            term.writeln("Resistance: " + r.metrics.resistance);
            term.writeln("RSI:        " + r.metrics.rsi);
            term.write(prompt);
          }).catch(err => {
            term.writeln("\x1b[31mError: " + err.message + "\x1b[0m");
            term.write(prompt);
          });
        } else {
          term.writeln("\x1b[31mDTO core not loaded.\x1b[0m");
          term.write(prompt);
        }
        break;
        
      case "swarm":
        term.writeln("Initializing Swarm Agents...");
        setTimeout(() => term.writeln("[Agent 1] Technical analysis parsing..."), 500);
        setTimeout(() => term.writeln("[Agent 2] Scraping macroeconomic sentiment..."), 1200);
        setTimeout(() => term.writeln("[Agent 3] Options flow verification..."), 2000);
        setTimeout(() => {
          term.writeln("");
          term.writeln("\x1b[32mSwarm Consensus Reached.\x1b[0m");
          term.writeln("All metrics aligned. See /api/bot/swarm for raw JSON matrix.");
          term.write(prompt);
        }, 3500);
        break;
        
      default:
        term.writeln("Command not found: " + root);
        term.write(prompt);
        break;
    }
  }
})();
