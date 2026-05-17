const fs = require("fs");
const path = require("path");
const { buildSite } = require("./build-site");

const root = path.resolve(__dirname, "..");
const watchDirs = [
  path.join(root, "src", "site"),
  path.join(root, "assets", "styles"),
  path.join(root, "assets", "scripts")
];

let timer = null;

function runBuild(reason = "startup") {
  try {
    const result = buildSite();
    console.log(`[site-watch] build complete (${reason}) -> ${result.canonicalCount} pages, ${result.redirectCount} redirects`);
  } catch (error) {
    console.error("[site-watch] build failed:", error.message);
  }
}

function scheduleBuild(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => runBuild(reason), 120);
}

watchDirs.forEach(dir => {
  fs.watch(dir, { recursive: true }, (_, fileName) => {
    if (!fileName) return;
    scheduleBuild(fileName);
  });
});

runBuild();
