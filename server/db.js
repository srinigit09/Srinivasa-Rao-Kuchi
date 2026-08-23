'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './data/panic_alarm.db';
const dir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ═══════════════════════════════════════════════════════════════
//  SCHEMA
// ═══════════════════════════════════════════════════════════════
db.exec(`
  -- Server admin users (only for the web admin panel)
  CREATE TABLE IF NOT EXISTS admin_users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    created_at  DATETIME DEFAULT (datetime('now'))
  );

  -- Clients = hospital / organisation registered in the system
  -- hospital_code must match the code entered on each client PC
  CREATE TABLE IF NOT EXISTS clients (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name   TEXT    NOT NULL,
    hospital_code TEXT    NOT NULL UNIQUE,
    system_limit  INTEGER NOT NULL DEFAULT 100,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT (datetime('now'))
  );

  -- User details registered from each client PC at first-run wizard
  -- role: 'doctor' | 'staff' | 'other'
  -- source: 'client' = self-registered via client app, 'admin' = added from admin panel
  CREATE TABLE IF NOT EXISTS client_users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    hospital_code   TEXT    NOT NULL,
    user_id         TEXT,               -- mandatory unique user-entered ID (e.g. EMP-001)
    room_number     TEXT    NOT NULL,
    system_number   TEXT    NOT NULL,
    user_name       TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'staff',  -- 'doctor' | 'staff' | 'other'
    source          TEXT    NOT NULL DEFAULT 'client', -- 'client' | 'admin'
    device_id       TEXT    NOT NULL UNIQUE,  -- auto-generated on first run
    token           TEXT,                     -- JWT issued after registration
    active          INTEGER NOT NULL DEFAULT 1,
    registered_at   DATETIME DEFAULT (datetime('now')),
    updated_at      DATETIME DEFAULT (datetime('now'))
  );

  -- Alarm audit log
  CREATE TABLE IF NOT EXISTS alarm_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    alarm_id        TEXT    NOT NULL UNIQUE,
    hospital_code   TEXT    NOT NULL,
    triggered_by    TEXT    NOT NULL,   -- user_name
    user_id         TEXT,               -- employee/user ID
    room_number     TEXT    NOT NULL,
    system_number   TEXT,
    device_id       TEXT,
    severity        TEXT    NOT NULL DEFAULT 'PANIC',
    message         TEXT    NOT NULL,
    acknowledged    INTEGER NOT NULL DEFAULT 0,
    ack_by          TEXT,
    ack_at          DATETIME,
    triggered_at    DATETIME DEFAULT (datetime('now'))
  );

  -- Settings key-value store
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Migrate existing DBs: add columns if missing ───────────────
const cuCols = db.pragma('table_info(client_users)').map(c => c.name);
if (!cuCols.includes('user_id')) {
  db.exec(`ALTER TABLE client_users ADD COLUMN user_id TEXT;`);
  console.log('[DB] Migrated: added user_id column to client_users');
}
if (!cuCols.includes('source')) {
  db.exec(`ALTER TABLE client_users ADD COLUMN source TEXT NOT NULL DEFAULT 'client';`);
  console.log('[DB] Migrated: added source column to client_users');
}
const alCols = db.pragma('table_info(alarm_log)').map(c => c.name);
if (!alCols.includes('user_id')) {
  db.exec(`ALTER TABLE alarm_log ADD COLUMN user_id TEXT;`);
  console.log('[DB] Migrated: added user_id column to alarm_log');
}
// Migrate role column default if old DB had 'viewer'
// (keep 'viewer' values working as 'staff' at API layer — no schema change needed)

// ── Seed admin on first run ────────────────────────────────────
const seedAdmin = db.transaction(() => {
  const existing = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
  if (!existing) {
    const password = process.env.ADMIN_PASSWORD || 'admin@PanicAlarm2026';
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)')
      .run(process.env.ADMIN_USERNAME || 'admin', hash);
    console.log('[DB] Admin user seeded — username: admin  password: admin@PanicAlarm2026');
    console.log('[DB] IMPORTANT: Change this password after first login!');
  }
});
seedAdmin();

// ═══════════════════════════════════════════════════════════════
//  PREPARED STATEMENTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  db,

  // Admin users
  findAdmin:           db.prepare('SELECT * FROM admin_users WHERE username = ?'),
  listAdmins:          db.prepare('SELECT id, username, created_at FROM admin_users'),
  updateAdminPassword: db.prepare('UPDATE admin_users SET password = ? WHERE id = ?'),

  // Clients
  listClients:         db.prepare('SELECT * FROM clients WHERE active = 1 ORDER BY client_name'),
  findClientByCode:    db.prepare('SELECT * FROM clients WHERE hospital_code = ? AND active = 1'),
  findClientById:      db.prepare('SELECT * FROM clients WHERE id = ?'),
  createClient:        db.prepare('INSERT INTO clients (client_name, hospital_code, system_limit) VALUES (?, ?, ?)'),
  updateClient:        db.prepare('UPDATE clients SET client_name=?, hospital_code=?, system_limit=? WHERE id=?'),
  deleteClient:        db.prepare('UPDATE clients SET active = 0 WHERE id = ?'),
  countClientUsers:    db.prepare('SELECT COUNT(*) as cnt FROM client_users WHERE client_id = ? AND active = 1'),

  // Client users (registered from each PC)
  listClientUsers:     db.prepare('SELECT * FROM client_users WHERE client_id = ? AND active = 1 ORDER BY room_number'),
  findClientUser:      db.prepare('SELECT * FROM client_users WHERE device_id = ?'),
  findClientUserById:  db.prepare('SELECT * FROM client_users WHERE id = ?'),
  findClientUserByUserId: db.prepare('SELECT * FROM client_users WHERE user_id = ? AND hospital_code = ? AND active = 1'),
  createClientUser:    db.prepare(`
    INSERT INTO client_users (client_id, hospital_code, user_id, room_number, system_number, user_name, role, source, device_id, token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  createClientUserAdmin: db.prepare(`
    INSERT INTO client_users (client_id, hospital_code, user_id, room_number, system_number, user_name, role, source, device_id, token)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?)
  `),
  updateClientUser:    db.prepare(`
    UPDATE client_users
    SET user_id=?, room_number=?, system_number=?, user_name=?, role=?, updated_at=datetime('now')
    WHERE id=?
  `),
  updateClientUserToken: db.prepare('UPDATE client_users SET token=? WHERE device_id=?'),
  deleteClientUser:    db.prepare('UPDATE client_users SET active = 0 WHERE id = ?'),

  // Alarm log
  insertLog:           db.prepare(`
    INSERT INTO alarm_log (alarm_id, hospital_code, triggered_by, user_id, room_number, system_number, device_id, severity, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  acknowledgeAlarm:    db.prepare(`
    UPDATE alarm_log SET acknowledged=1, ack_by=?, ack_at=datetime('now') WHERE alarm_id=?
  `),
  listLogs:            db.prepare('SELECT * FROM alarm_log ORDER BY triggered_at DESC LIMIT 500'),
  listLogsByHospital:  db.prepare('SELECT * FROM alarm_log WHERE hospital_code=? ORDER BY triggered_at DESC LIMIT 200'),
  listLogsByDate:      db.prepare('SELECT * FROM alarm_log WHERE triggered_at BETWEEN ? AND ? ORDER BY triggered_at DESC'),

  // Settings
  getSetting:          db.prepare('SELECT value FROM settings WHERE key=?'),
  setSetting:          db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
};
