const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'database.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT,
    image_path TEXT,
    scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT,
    violations_count INTEGER DEFAULT 0,
    ocr_text TEXT,
    result_json TEXT,
    report_path TEXT,
    scanned_by TEXT DEFAULT 'demo-officer',
    role TEXT DEFAULT 'ENFORCEMENT_OFFICER'
  );
`);


db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL   -- 'ADMIN' | 'ENFORCEMENT_OFFICER'
  );
`);


db.exec(`
  CREATE TABLE IF NOT EXISTS manufacturer_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lot_number TEXT NOT NULL UNIQUE,
    product_name TEXT NOT NULL,

    manufacturer_name TEXT,
    manufacturer_address TEXT,

    net_quantity TEXT,
    mrp TEXT,
    manufacture_date TEXT,

    consumer_care TEXT,
    country_of_origin TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
  );
`);


// Seed demo users only if the table is empty — safe to run every startup
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const insertUser = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  );
  insertUser.run('admin', bcrypt.hashSync('admin123', 10), 'System Admin', 'ADMIN');
  insertUser.run('officer1', bcrypt.hashSync('officer123', 10), 'Enforcement Officer', 'ENFORCEMENT_OFFICER');
  console.log('Seeded demo users: admin/admin123 (ADMIN), officer1/officer123 (ENFORCEMENT_OFFICER)');
}

module.exports = db;