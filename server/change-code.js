#!/usr/bin/env node
/**
 * change-code.js — Credential-protected server code updater
 * ──────────────────────────────────────────────────────────
 * Run this on the server machine whenever you want to pull latest
 * code from your repository. Requires admin password before proceeding.
 *
 * Usage:  node change-code.js
 *
 * Copyright / proprietary notice:
 *   All server-side business logic in this application is proprietary.
 *   Any modification requires authorised admin access via this tool.
 */

'use strict';

const readline  = require('readline');
const { execSync, spawnSync } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const bcrypt    = require('bcryptjs');

const LOCK_FILE = path.join(__dirname, '.change-lock');
const ENV_FILE  = path.join(__dirname, '.env');

// Read admin password hash from DB for verification
function getAdminHash() {
  try {
    const Database = require('better-sqlite3');
    const dbPath   = process.env.DB_PATH || './data/panic_alarm.db';
    const db       = new Database(path.resolve(dbPath));
    const row      = db.prepare("SELECT password FROM users WHERE role='admin' LIMIT 1").get();
    db.close();
    return row ? row.password : null;
  } catch { return null; }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function main() {
  require('dotenv').config({ path: ENV_FILE });

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   🔒  PANIC ALARM SERVER — CODE UPDATE TOOL           ║');
  console.log('║   Admin credentials required to proceed               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Check if another update is in progress
  if (fs.existsSync(LOCK_FILE)) {
    const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (age < 300000) { // 5 minutes
      console.error('❌  Another update is in progress. If stale, delete .change-lock and retry.');
      process.exit(1);
    }
    fs.unlinkSync(LOCK_FILE);
  }

  // Verify admin credentials
  const hash = getAdminHash();
  if (!hash) {
    console.error('❌  Cannot read admin credentials from database. Is the server configured?');
    process.exit(1);
  }

  const password = await ask('Enter admin password: ');
  rl.close();

  if (!bcrypt.compareSync(password, hash)) {
    console.error('\n❌  Incorrect password. Access denied.\n');
    // Log failed attempt
    const logLine = `[${new Date().toISOString()}] FAILED code-change attempt from ${process.env.USER || 'unknown'}\n`;
    fs.appendFileSync(path.join(__dirname, 'data', 'security.log'), logLine);
    process.exit(1);
  }

  console.log('\n✅  Authenticated. Proceeding with update...\n');

  // Log successful access
  const logLine = `[${new Date().toISOString()}] Authorised code-change by ${process.env.USER || 'unknown'}\n`;
  fs.appendFileSync(path.join(__dirname, 'data', 'security.log'), logLine);

  fs.writeFileSync(LOCK_FILE, new Date().toISOString());

  try {
    const serverRoot = path.join(__dirname, '..');

    // 1. Show what will change
    console.log('📋  Checking for updates...');
    const fetch = spawnSync('git', ['fetch', '--all'], { cwd: serverRoot, stdio: 'inherit' });
    if (fetch.status !== 0) { console.warn('⚠️  git fetch failed (no remote?). Skipping.'); }

    const diff = spawnSync('git', ['diff', '--stat', 'HEAD', 'origin/main'], { cwd: serverRoot, encoding: 'utf8' });
    if (diff.stdout) {
      console.log('\nChanges to be applied:\n');
      console.log(diff.stdout);
    } else {
      console.log('No remote changes detected. Running npm install anyway.\n');
    }

    // 2. Pull latest code
    console.log('📥  Pulling latest code...');
    const pull = spawnSync('git', ['pull', 'origin', 'main'], { cwd: serverRoot, stdio: 'inherit' });
    if (pull.status !== 0) {
      console.warn('⚠️  git pull failed or no remote configured. Continuing with npm install.');
    }

    // 3. Install / update dependencies
    console.log('\n📦  Installing dependencies...');
    execSync('npm install', { cwd: __dirname, stdio: 'inherit' });

    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  ✅  Update complete!                                  ║');
    console.log('║  Please RESTART the server for changes to take effect.║');
    console.log('║  Command: node server.js                               ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
  } finally {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
