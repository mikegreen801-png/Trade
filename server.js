const path = require("path");
const fs = require("fs");
const express = require("express");

const app = express();
const port = Number(process.env.PORT || 3000);
const root = __dirname;

function chooseWebRoot() {
  const extractedRoot = path.join(root, "extracted-files");
  const extractedIndex = path.join(extractedRoot, "index.html");
  const rootIndex = path.join(root, "index.html");

  if (fs.existsSync(extractedIndex)) {
    return { webRoot: extractedRoot, source: "extracted-files" };
  }
  if (fs.existsSync(rootIndex)) {
    return { webRoot: root, source: "repo-root" };
  }

  const checked = [extractedIndex, rootIndex];
  const error = new Error(`No index.html found. Checked: ${checked.join(" | ")}`);
  error.code = "NO_INDEX_FOUND";
  throw error;
}

let selected;
try {
  selected = chooseWebRoot();
} catch (error) {
  console.error("[DayTraderOS] Startup root detection failed:", error.message);
  process.exit(1);
}

const webRoot = selected.webRoot;
const startupIndex = path.join(webRoot, "index.html");
const startupApiDir = path.join(webRoot, "api");

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Static assets and pages
app.use(express.static(webRoot, { extensions: ["html"] }));

// Keep Netlify-style function paths working by forwarding to Vercel-style API files
app.use("/.netlify/functions/:name", async (req, res, next) => {
  try {
    req.url = `/api/${req.params.name}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;
    next();
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Rewrite failed" });
  }
});

// Minimal API bridge that executes extracted-files/api/*.js handlers
app.all("/api/:name", async (req, res) => {
  try {
    const apiPath = path.join(webRoot, "api", `${req.params.name}.js`);
    delete require.cache[require.resolve(apiPath)];
    const handler = require(apiPath);
    if (typeof handler !== "function") {
      return res.status(500).json({ ok: false, error: `Invalid API handler: ${req.params.name}` });
    }
    return handler(req, res);
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      return res.status(404).json({ ok: false, error: `API route not found: ${req.params.name}` });
    }
    return res.status(500).json({ ok: false, error: error.message || "API error" });
  }
});

// Friendly routes without .html
app.get("/:page", (req, res, next) => {
  if (req.params.page.includes(".")) return next();
  const target = path.join(webRoot, `${req.params.page}.html`);
  res.sendFile(target, err => {
    if (err) next();
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(port, () => {
  console.log(`[DayTraderOS] Web service running on port ${port}`);
  console.log(`[DayTraderOS] webRoot source: ${selected.source}`);
  console.log(`[DayTraderOS] webRoot path: ${webRoot}`);
  console.log(`[DayTraderOS] index.html exists: ${fs.existsSync(startupIndex)}`);
  console.log(`[DayTraderOS] api directory exists: ${fs.existsSync(startupApiDir)}`);
});
