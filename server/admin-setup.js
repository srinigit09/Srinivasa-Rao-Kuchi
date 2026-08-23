#!/usr/bin/env node
/**
 * admin-setup.js
 * ──────────────
 * Run this on the SERVER machine to prepare client-config.json files
 * for each room. Each config has a pre-issued JWT token baked in — 
 * so client machines need NO login screen.
 *
 * Usage:
 *   node admin-setup.js
 *
 * Requires admin credentials. Generates one client-config.json per room.
 */

'use strict';

require('dotenv').config({ path: './server/.env' });

const readline = require('readline');
const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const path     = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

function doRequest(serverUrl, method, endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const u       = new URL(serverUrl + endpoint);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname,
      port    : u.port || (u.protocol === 'https:' ? 443 : 80),
      path    : u.pathname + u.search,
      method,
      headers : {
        'Content-Type' : 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   🚨  PANIC ALARM — ADMIN SETUP TOOL                 ║');
  console.log('║   Generates pre-configured client files per room      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('This tool requires ADMIN credentials to connect to the server.');
  console.log('Run this on the server machine after starting the server.\n');

  const serverUrl  = (await ask('Server URL [http://localhost:4000]: ')).trim() || 'http://localhost:4000';
  const adminUser  = (await ask('Admin username [admin]: ')).trim() || 'admin';
  const adminPass  = await ask('Admin password: ');

  // ── Authenticate ───────────────────────────────────────────────────────────
  let adminToken;
  try {
    const r = await doRequest(serverUrl, 'POST', '/api/login', { username: adminUser, password: adminPass });
    if (r.status !== 200) {
      console.error('\n❌  Login failed:', r.body.error || r.body);
      process.exit(1);
    }
    adminToken = r.body.token;
    console.log(`\n✅  Authenticated as admin (${adminUser})\n`);
  } catch (e) {
    console.error('\n❌  Cannot connect to server:', e.message);
    process.exit(1);
  }

  // ── List existing rooms ────────────────────────────────────────────────────
  const roomsResp = await doRequest(serverUrl, 'GET', '/api/rooms', null, adminToken);
  const rooms     = roomsResp.body || [];
  console.log(`Existing rooms: ${rooms.map(r => r.room_name).join(', ') || '(none)'}`);

  console.log('\n─────────────────────────────────────────────────');
  console.log('Create user accounts for each room/PC.');
  console.log('Role: "doctor" = floating panic button | "viewer" = monitor screen');
  console.log('Type DONE when finished.\n');

  const OUTPUT_DIR = path.join(__dirname, 'client-configs');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  let count = 0;
  while (true) {
    const roomName = (await ask(`Room name (or DONE): `)).trim();
    if (roomName.toUpperCase() === 'DONE') break;
    if (!roomName) continue;

    const role     = (await ask(`  Role for ${roomName} [viewer/doctor]: `)).trim() || 'viewer';
    const username = (await ask(`  Username for ${roomName} [${roomName.toLowerCase().replace(/\s/g,'_')}]: `)).trim()
                     || roomName.toLowerCase().replace(/\s/g, '_');
    const password = (await ask(`  Password for ${username}: `)).trim();

    // Create room if new
    const exists = rooms.find(r => r.room_name === roomName);
    if (!exists) {
      await doRequest(serverUrl, 'POST', '/api/rooms', { room_name: roomName, description: '' }, adminToken);
      console.log(`  → Room "${roomName}" created`);
    }

    // Create user
    const uResp = await doRequest(serverUrl, 'POST', '/api/users',
      { username, password, role, room_name: roomName }, adminToken);
    if (uResp.status === 409) {
      console.log(`  ⚠️  User "${username}" already exists — reusing`);
    } else if (uResp.status !== 201) {
      console.log(`  ❌  Failed to create user: ${JSON.stringify(uResp.body)}`);
      continue;
    } else {
      console.log(`  → User "${username}" created (role: ${role})`);
    }

    // Login as this user to get their token
    const loginResp = await doRequest(serverUrl, 'POST', '/api/login', { username, password });
    if (loginResp.status !== 200) {
      console.log(`  ❌  Could not get token for "${username}"`);
      continue;
    }

    // Write client-config.json
    const config = {
      serverUrl,
      roomName,
      role : loginResp.body.role,
      username,
      token: loginResp.body.token,
    };
    const outFile = path.join(OUTPUT_DIR, `client-config-${roomName.replace(/\s/g,'-')}.json`);
    fs.writeFileSync(outFile, JSON.stringify(config, null, 2));
    console.log(`  ✅  Config saved: ${outFile}\n`);
    count++;
  }

  rl.close();
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  ✅  Generated ${count} client config file(s)           `);
  console.log('║                                                       ║');
  console.log('║  Copy each file to the matching PC:                   ║');
  console.log('║    Windows: C:\\Program Files\\PanicAlarm\\              ║');
  console.log('║             resources\\app\\client-config.json           ║');
  console.log('║    Mac:     /Applications/PanicAlarm.app/             ║');
  console.log('║             Contents/Resources/app/client-config.json ║');
  console.log('║                                                       ║');
  console.log('║  Then restart the PanicAlarm app on that PC.         ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
