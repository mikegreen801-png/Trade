const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const watchTargets = [
  path.join(root, "server.js"),
  path.join(root, ".env"),
  path.join(root, "api")
];

let child = null;
let restartTimer = null;

function start() {
  child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", code => {
    if (code !== 0) {
      console.log(`[dev-server] child exited with ${code}`);
    }
  });
}

function restart(reason) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`[dev-server] restart -> ${reason}`);
    if (child) {
      child.kill();
    }
    start();
  }, 120);
}

watchTargets.forEach(target => {
  if (!fs.existsSync(target)) return;
  const stats = fs.statSync(target);
  if (stats.isDirectory()) {
    fs.watch(target, { recursive: true }, (_, fileName) => restart(fileName || target));
  } else {
    fs.watchFile(target, { interval: 250 }, () => restart(path.basename(target)));
  }
});

process.on("SIGINT", () => {
  if (child) child.kill("SIGINT");
  process.exit(0);
});

start();
