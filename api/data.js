/**
 * SQLite Data API — /api/data?collection=...&action=...
 * Persistent CRUD for setups, reviews, watchlist, portfolio, rules, alerts.
 * Falls back gracefully if better-sqlite3 is not installed.
 */

let db = null;
try {
  const Database = require("better-sqlite3");
  const path = require("path");
  const dbPath = path.join(__dirname, "..", "data", "dto.db");

  // Ensure data dir exists
  const fs = require("fs");
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Create collections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_col ON collections(collection);
  `);

  console.log("[API/data] SQLite database ready at", dbPath);
} catch (e) {
  console.warn("[API/data] SQLite not available, using in-memory fallback:", e.message);
}

// In-memory fallback when SQLite is not installed
const memStore = {};

function memList(col) {
  return memStore[col] || [];
}

function memUpsert(col, id, data) {
  if (!memStore[col]) memStore[col] = [];
  const idx = memStore[col].findIndex(r => r.id === id);
  const record = { id, ...data, updated_at: new Date().toISOString() };
  if (idx >= 0) memStore[col][idx] = record;
  else memStore[col].unshift(record);
  return record;
}

function memDelete(col, id) {
  if (!memStore[col]) return false;
  const before = memStore[col].length;
  memStore[col] = memStore[col].filter(r => r.id !== id);
  return memStore[col].length < before;
}

module.exports = async function handler(req, res) {
  const collection = String(req.query.collection || "").trim();
  const action = String(req.query.action || "list");

  const ALLOWED = ["setups", "reviews", "watchlist", "portfolio", "rules", "alerts"];
  if (!ALLOWED.includes(collection)) {
    return res.status(400).json({ ok: false, error: `Invalid collection: ${collection}. Allowed: ${ALLOWED.join(", ")}` });
  }

  try {
    switch (action) {
      case "list": {
        const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
        if (db) {
          const rows = db.prepare("SELECT id, data, created_at, updated_at FROM collections WHERE collection = ? ORDER BY updated_at DESC LIMIT ?").all(collection, limit);
          const items = rows.map(r => ({ id: r.id, ...JSON.parse(r.data), created_at: r.created_at, updated_at: r.updated_at }));
          return res.json({ ok: true, collection, items, count: items.length });
        }
        const items = memList(collection).slice(0, limit);
        return res.json({ ok: true, collection, items, count: items.length });
      }

      case "get": {
        const id = String(req.query.id || "").trim();
        if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
        if (db) {
          const row = db.prepare("SELECT id, data, created_at, updated_at FROM collections WHERE collection = ? AND id = ?").get(collection, id);
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({ ok: true, item: { id: row.id, ...JSON.parse(row.data), created_at: row.created_at, updated_at: row.updated_at } });
        }
        const item = memList(collection).find(r => r.id === id);
        return item ? res.json({ ok: true, item }) : res.status(404).json({ ok: false, error: "Not found" });
      }

      case "upsert": {
        if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });
        const body = req.body || {};
        const id = body.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const data = { ...body };
        delete data.id;

        if (db) {
          db.prepare(`INSERT INTO collections (id, collection, data) VALUES (?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`)
            .run(id, collection, JSON.stringify(data));
          return res.json({ ok: true, id, collection });
        }
        memUpsert(collection, id, data);
        return res.json({ ok: true, id, collection });
      }

      case "delete": {
        if (req.method !== "POST" && req.method !== "DELETE") return res.status(405).json({ ok: false, error: "POST or DELETE required" });
        const delId = req.query.id || (req.body && req.body.id);
        if (!delId) return res.status(400).json({ ok: false, error: "Missing id" });

        if (db) {
          const result = db.prepare("DELETE FROM collections WHERE collection = ? AND id = ?").run(collection, delId);
          return res.json({ ok: true, deleted: result.changes > 0 });
        }
        return res.json({ ok: true, deleted: memDelete(collection, delId) });
      }

      case "clear": {
        if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });
        if (db) {
          db.prepare("DELETE FROM collections WHERE collection = ?").run(collection);
        } else {
          memStore[collection] = [];
        }
        return res.json({ ok: true, collection, cleared: true });
      }

      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[API/data] ${action} error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
