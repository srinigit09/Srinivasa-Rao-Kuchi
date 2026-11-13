'use strict';

/**
 * Persistent, rotating event log (JSON lines) for operational events:
 * server start/stop/crash, admin sign-in/out, client connect/disconnect, client-reported outages,
 * failed alarm deliveries. Never write passwords, tokens or other secrets here.
 *
 * Location: LOG_DIR env var, else "<folder of the database>/../logs" (the shared per-computer data folder).
 * Rotation: panic-alarm-server.log -> .1 -> .2 ... (5 files x 2 MB).
 */
const fs   = require('fs');
const path = require('path');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_FIELD = 200;

let logFile = null;
function resolveLogFile() {
  if (logFile) return logFile;
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'panic_alarm.db');
  const dir = process.env.LOG_DIR || path.join(path.dirname(path.resolve(dbPath)), '..', 'logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (process.platform !== 'win32') { try { fs.chmodSync(dir, 0o777); } catch { /* not owner */ } }
  } catch { /* logging must never break the server */ }
  logFile = path.join(path.resolve(dir), 'panic-alarm-server.log');
  return logFile;
}

function rotateIfNeeded(file) {
  try {
    if (fs.statSync(file).size < MAX_BYTES) return;
  } catch { return; }   // no file yet
  try {
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i}`);
    }
  } catch { /* ignore */ }
}

// Keep log entries on one line and bounded; strip control characters (log-injection safe).
function clean(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_FIELD);
}

function logEvent(level, event, fields = {}) {
  try {
    const entry = { ts: new Date().toISOString(), level, event };
    for (const [k, v] of Object.entries(fields)) entry[k] = clean(v);
    const file = resolveLogFile();
    rotateIfNeeded(file);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o666 });
  } catch { /* logging must never break the server */ }
}

module.exports = {
  info : (event, fields) => logEvent('INFO',  event, fields),
  warn : (event, fields) => logEvent('WARN',  event, fields),
  error: (event, fields) => logEvent('ERROR', event, fields),
  getLogFile: resolveLogFile,
};
