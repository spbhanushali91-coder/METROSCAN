// Uses Node.js's built-in SQLite module (node:sqlite) — no native compilation
// required, unlike better-sqlite3. Available unflagged in Node.js 22.5+ / 23.4+.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'database.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT,
    image_path TEXT,
    scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT,                 -- 'COMPLIANT' | 'NON_COMPLIANT'
    violations_count INTEGER DEFAULT 0,
    ocr_text TEXT,
    result_json TEXT,            -- full compliance result from OCR service
    report_path TEXT,
    scanned_by TEXT DEFAULT 'demo-officer',
    role TEXT DEFAULT 'ENFORCEMENT_OFFICER'
  );
`);

module.exports = db;
