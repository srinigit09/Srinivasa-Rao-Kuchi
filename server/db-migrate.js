'use strict';
/**
 * Versioned, data-preserving database migrations.
 *
 * Rules that keep existing data safe on every server upgrade:
 *   1. The schema version is stored inside the database file (PRAGMA user_version).
 *   2. Before ANY pending migration runs, a full copy of the database is saved next to it
 *      (<db>.pre-migrate-v<from>-to-v<to>-<time>); the 5 newest copies are kept.
 *   3. Each migration runs in its own transaction together with its version bump: it either fully
 *      applies or leaves the database exactly as it was.
 *   4. If a migration fails, or the database was written by a NEWER server version, the server
 *      refuses to start with a clear error instead of touching the data.
 *
 * To change the database in a future version: append ONE entry to MIGRATIONS in db.js
 * (never edit or reorder old entries). Prefer additive changes (new table / new column).
 */
const fs   = require('fs');
const path = require('path');

const KEEP_BACKUPS = 5;

function fail(code, message, cause) {
  const e = new Error(message);
  e.code = code;
  if (cause) e.cause = cause;
  return e;
}

function hasData(db) {
  try { return db.prepare('SELECT 1 FROM admin_users LIMIT 1').get() !== undefined; }
  catch { return false; }
}

function pruneBackups(dbPath) {
  const dir = path.dirname(dbPath), prefix = path.basename(dbPath) + '.pre-migrate-';
  const files = fs.readdirSync(dir).filter(n => n.startsWith(prefix))
    .map(n => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const f of files.slice(KEEP_BACKUPS)) {
    try { fs.unlinkSync(path.join(dir, f.n)); } catch { /* best effort */ }
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} dbPath          absolute path of the database file
 * @param {{version:number,name:string,up:(db)=>void}[]} migrations   ascending, versions 1..N
 * @returns {{from:number,to:number,backup:string|null}}
 */
function runMigrations(db, dbPath, migrations) {
  const latest  = migrations.length ? migrations[migrations.length - 1].version : 0;
  const current = db.pragma('user_version', { simple: true });

  if (current > latest) {
    throw fail('DB_TOO_NEW',
      `This database is from a newer server version (schema ${current}, this server supports up to ${latest}). ` +
      'Install the newer server version; the data has NOT been changed.');
  }
  if (current === latest) return { from: current, to: latest, backup: null };

  // Safety copy before touching an existing database that holds data
  let backup = null;
  if (hasData(db)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backup = `${dbPath}.pre-migrate-v${current}-to-v${latest}-${stamp}`;
    try {
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
      pruneBackups(dbPath);
    } catch (e) {
      throw fail('DB_BACKUP_FAILED', `Could not save a safety copy before upgrading the database: ${e.message}`, e);
    }
  }

  for (const m of migrations) {
    if (m.version <= current) continue;
    try {
      db.transaction(() => {
        m.up(db);
        db.pragma(`user_version = ${m.version}`);
      })();
      console.log(`[DB] Applied migration ${m.version}: ${m.name}`);
    } catch (e) {
      throw fail('DB_MIGRATION_FAILED',
        `Database upgrade step ${m.version} (${m.name}) failed: ${e.message}. ` +
        `Your data was left unchanged${backup ? ` and a copy is saved at ${backup}` : ''}.`, e);
    }
  }
  return { from: current, to: latest, backup };
}

module.exports = { runMigrations };
