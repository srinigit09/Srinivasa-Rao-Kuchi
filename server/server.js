'use strict';

// Load environment variables (Properties)
try {
  const dotenv = require('dotenv');
  const fs = require('fs');
  const path = require('path');
  const cwdDir = process.cwd();
  
  const loadEnvFile = (filename) => {
    const p = path.join(cwdDir, filename);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return true;
    }
    return false;
  };

  const loadedServer = loadEnvFile('server.env');
  const loadedBootstrap = loadEnvFile('bootstrap.env');
  if (!loadedServer && !loadedBootstrap) {
    loadEnvFile('.env');
  }
} catch {
  // fallback if any loading issue occurs
  require('dotenv').config();
}

const express     = require('express');
const http        = require('http');
const net         = require('net');
const { Server }  = require('socket.io');
const cors        = require('cors');
const bcrypt      = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const os          = require('os');
const path        = require('path');
const fs          = require('fs');
const eventLog = require('./event-log');
const mailer   = require('./mailer');
const { queryLogRows, toCsv, buildAlarmEmail } = require('./alarm-logs');
const { createLicense } = require('./license');
const { requireAdmin, requireClient, adminLogin, signClientToken, signAdminToken, DEFAULT_ADMIN_PASSWORD } = require('./auth');
const {
  db,
  findAdmin, updateAdminPassword, updateAdminUsername, updateAdminCredentials,
  listClients, findClientByCode, findClientById, createClient, updateClient, deleteClient, countClientUsers, setClientLocation,
  listClientUsers, findClientUser, findClientUserById, findClientUserByUserId,
  createClientUser, createClientUserAdmin, updateClientUser,
  updateClientUserToken, deleteClientUser,
  insertLog, findAlarm, insertRecipient, ackRecipient, ackRecipientDevice, noRespRecipient, noRespRecipientDevice,
  notDeliveredRecipient, settleRecipients, settleStaleRecipients,
  acknowledgeAlarm, markNoResponse, setAlarmDelivered, settleStaleAlarms,
  deleteLogById, hideLogDash, hideLogLogs, hideAllDash, hideAllLogs,
  getSetting, setSetting,
  listLocations, listLocationsByHospital,
  listDeptBlocks, listDeptBlocksByHospital,
  listDepartments, listDepartmentsByHospital, findDepartmentById, createDepartment, updateDepartment, deleteDepartment,
} = require('./db');

const ALARM_SETTLE_MS = 20 * 1000;   // popup auto-close time
// On startup, settle alarms left unresolved by a previous run/restart
settleStaleAlarms.run('-20 seconds');
settleStaleRecipients.run('-20 seconds');
setInterval(() => {
  try { settleStaleAlarms.run('-20 seconds'); settleStaleRecipients.run('-20 seconds'); } catch { /* ignore */ }
}, 10 * 1000).unref();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] } });

function readSetting(key) {
  try { const r = getSetting.get(key); return r && r.value != null ? String(r.value) : ''; } catch { return ''; }
}

// IPv4 addresses the OS reports (read fresh every call). Link-local 169.254.x.x are not usable.
// The OS can still list an address whose adapter is disabled/disconnected, so every candidate is
// also test-bound (canBindIp) before it is ever used or shown as an available IP.
function getLocalIPv4s() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map(i => i.address);
}

function canBindIp(ip) {
  return new Promise((resolve) => {
    const t = net.createServer();
    t.once('error', () => resolve(false));
    t.once('listening', () => t.close(() => resolve(true)));
    try { t.listen(0, ip); } catch { resolve(false); }
  });
}

let usableIpCache = [];
let usableIpKnown = false;   // the first check only learns the starting list; later differences are real changes
async function refreshUsableIPs() {
  const out = [];
  for (const ip of getLocalIPv4s()) { if (await canBindIp(ip)) out.push(ip); }
  const before = usableIpCache;
  usableIpCache = out;
  if (usableIpKnown) {
    const added = out.filter(ip => !before.includes(ip));
    const removed = before.filter(ip => !out.includes(ip));
    if (added.length || removed.length) announceIpChange({ added, removed, ips: out });
  }
  usableIpKnown = true;
  return out;
}

// An IP appeared or disappeared: record it, tell the admin panel (live) and the desktop app (notification)
function announceIpChange(change) {
  eventLog.warn('network_ips_changed', { added: change.added.join(','), removed: change.removed.join(',') });
  const bound = server.address();
  const port = bound ? bound.port : PORT;
  const payload = { ...change, port, boundHost: HOST };
  try { io.to('admin').emit('network_changed', payload); } catch { /* best effort */ }
  try { if (typeof global.__onNetworkChange === 'function') global.__onNetworkChange(payload); } catch { /* best effort */ }
}
setInterval(() => { refreshUsableIPs().catch(() => {}); }, 10 * 1000).unref();

// PORT priority:
// 1. Port chosen by the admin (Admin Panel / Edit IP Address) - 'server_port_admin'
// 2. Environment / server.env (if explicitly set > 0)
// 3. Database setting 'server_port' saved from previous installation/run (if set > 0)
// 4. Default fixed port 5000 (persisted permanently on first install so restarts retain the same port)
const adminPort = parseInt(readSetting('server_port_admin'), 10);
let initialPort = adminPort > 0 ? adminPort : parseInt(process.env.PORT || '0', 10);
if (!initialPort) {
  const dbPort = parseInt(readSetting('server_port'), 10);
  if (dbPort > 0) initialPort = dbPort;
}
if (!initialPort) {
  initialPort = 5000; // Fixed default port for first installation
}
let PORT = initialPort;

// ── Waiting for the saved IP ───────────────────────────────────
// When the IP the server is meant to use is not available (adapter disabled / cable out / not up yet after a
// reboot) the server NEVER moves to another IP by itself right away: the IP may be back in a minute, and every
// client would have to be changed for nothing. Instead it
//   - listens on this computer only (127.0.0.1) so the tray / admin windows keep working,
//   - tells the admin (tray dialog, notification, admin panel) and offers: wait longer / use the next available
//     address / enter an IP,
//   - keeps trying the saved IP, and only after IP_WAIT_MS without any answer switches to all interfaces.
const IP_WAIT_MS = 180 * 1000;
let ipWait = null;   // { ip, port, since, deadline, extensions, warned, sig }

// HOST priority: IP chosen by the admin ('server_host_admin') > HOST from server.env > 0.0.0.0 (all interfaces).
// A configured IP that does not exist right now starts the wait above; the saved value is kept for when it returns.
let hostFallbackFrom = '';
function resolveHost(ips) {
  const admin = readSetting('server_host_admin');
  const env = (process.env.HOST || '').trim();
  const wanted = admin || (env && env !== '0.0.0.0' ? env : '');
  if (!wanted) return '0.0.0.0';
  if (ips.includes(wanted) || (!admin && wanted === '127.0.0.1')) return wanted;
  hostFallbackFrom = wanted;
  eventLog.warn('configured_ip_unavailable', { ip: wanted });
  startIpWait(wanted);
  return '127.0.0.1';
}
let HOST = '0.0.0.0';   // decided just before listening (needs the async IP check)

// Addresses clients can really connect to: every usable local IP when bound to all interfaces, otherwise only the bound one
function getListeningIPs() {
  if (ipWait) return [];   // waiting: nothing outside this computer can connect
  if (HOST === '0.0.0.0') return usableIpCache.slice();
  return [HOST];
}
// Address the server's own windows use to reach it (a server bound to one IP does not answer on localhost)
function getLocalHost() { return HOST === '0.0.0.0' ? 'localhost' : HOST; }

const IP_WARN_AFTER_MS = 15 * 1000;   // a few seconds of "adapter not up yet" at boot is normal: do not alarm the admin for it
function currentBoundPort() { const b = server.address(); return b && b.port ? b.port : PORT; }
function nextUsableIp(excluding) { return usableIpCache.find(ip => ip !== excluding) || ''; }

// Random id of THIS server (kept in the database). Clients only follow a new address when it reports the same id,
// so they can never be steered to some other machine.
function getServerId() {
  let id = readSetting('server_instance_id');
  if (!id) { id = uuidv4(); try { setSetting.run('server_instance_id', id); } catch { /* best effort */ } }
  return id;
}
// Addresses clients can try for this server: the preferred ones first, then every other IP of this computer.
// Clients remember the list; when they lose the server they probe it (and only follow an address whose /health
// answers with this server's id), so a changed IP does not need a visit to every client computer.
function addressPayload(preferred, port) {
  const urls = [...new Set([...(preferred || []), ...usableIpCache.map(ip => `http://${ip}:${port}`)])];
  return { serverId: getServerId(), urls };
}
function broadcastServerAddresses(preferred, port) {
  try { io.emit('server_addresses', addressPayload(preferred, port)); } catch { /* best effort */ }
}

// What the admin sees while the server waits for its IP (null until the short start-up grace period is over)
function getIpWaitInfo() {
  if (!ipWait || !ipWait.warned) return null;
  return {
    ip: ipWait.ip, port: ipWait.port, nextIp: nextUsableIp(ipWait.ip),
    ips: usableIpCache.filter(ip => ip !== ipWait.ip),   // every address the admin can switch to right now
    remainingSec: Math.max(0, Math.round((ipWait.deadline - Date.now()) / 1000)),
    waitSec: IP_WAIT_MS / 1000, extensions: ipWait.extensions,
  };
}
function announceIpWait(kind, extra) {
  const info = { kind, ...(getIpWaitInfo() || {}), ...(extra || {}) };
  try { io.to('admin').emit('ip_wait', info); } catch { /* best effort */ }
  try { if (typeof global.__onIpWait === 'function') global.__onIpWait(kind, info); } catch { /* best effort */ }
}

function startIpWait(ip) {
  if (ipWait && ipWait.ip === ip) return;
  const now = Date.now();
  ipWait = { ip, port: currentBoundPort(), since: now, deadline: now + IP_WARN_AFTER_MS + IP_WAIT_MS, extensions: 0, warned: false, reminded: false };
  eventLog.warn('ip_wait_started', { ip, port: ipWait.port });
}

// Move the listener to another address without restarting the application (already connected sockets are kept)
function rebind(host, port, delayMs = 0) {
  HOST = host;
  if (port) PORT = port;
  setTimeout(() => {
    try { server.close(); } catch { /* not listening */ }
    server.listen(PORT, HOST);
  }, delayMs);
}

// The wait is over because the IP came back, or the time ran out without an answer from the admin
function finishIpWait(kind) {
  const w = ipWait;
  if (!w) return;
  ipWait = null;
  eventLog.warn('ip_wait_' + kind, { ip: w.ip, waitedSec: Math.round((Date.now() - w.since) / 1000) });
  if (kind === 'returned') {
    hostFallbackFrom = '';
    rebind(w.ip, w.port);                         // same address as before: no client has to change anything
  } else {
    rebind('0.0.0.0', w.port);                     // nobody answered: serve on whatever addresses exist
  }
  if (w.warned || kind === 'timeout') announceIpWait(kind, { ip: w.ip, port: w.port });
}

// The admin chose an address while the server was waiting (next available IP, or one typed in): apply it now,
// without restarting the application.
function completeIpWait(host, port) {
  const w = ipWait;
  ipWait = null;
  hostFallbackFrom = '';
  rebind(host, port, 300);   // a moment later, so the answer to the request that asked for it can still be delivered
  announceIpWait('resolved', { ip: host === '0.0.0.0' ? 'all interfaces' : host, port, oldIp: w ? w.ip : '' });
}

async function ipWaitAction(action, chosenIp) {
  if (!ipWait) return { ok: false, error: 'The server is not waiting for an IP address any more.' };
  if (action === 'wait') {
    ipWait.deadline = Date.now() + IP_WAIT_MS;
    ipWait.extensions++;
    ipWait.reminded = false;
    eventLog.info('ip_wait_extended', { ip: ipWait.ip, extensions: ipWait.extensions });
    announceIpWait('extended');
    return { ok: true, message: `Waiting ${IP_WAIT_MS / 1000} more seconds for ${ipWait.ip}.` };
  }
  if (action === 'use-next' || action === 'use') {
    await refreshUsableIPs();
    if (!ipWait) return { ok: false, error: 'The server is not waiting for an IP address any more.' };
    // 'use' = the address the admin picked from the list; applyNetworkConfig checks it really is available
    const target = action === 'use' ? String(chosenIp || '').trim() : nextUsableIp(ipWait.ip);
    if (!target || target === ipWait.ip) return { ok: false, error: 'No other IP address is available on this computer right now.' };
    return applyNetworkConfig({ host: target, port: ipWait.port });   // applies live while waiting
  }
  return { ok: false, error: 'Unknown action.' };
}

// ── Server ready state (tracks whether Admin is logged in) ─────
let isServerLoggedIn = false;

function setServerLoggedIn(loggedIn) {
  if (isServerLoggedIn !== !!loggedIn) eventLog.info(loggedIn ? 'server_ready' : 'server_awaiting_admin_login');
  isServerLoggedIn = !!loggedIn;
  console.log(`[Server] Server ready state changed: ready = ${isServerLoggedIn}`);
  io.emit('server_state', {
    ready: isServerLoggedIn,
    message: isServerLoggedIn ? 'Server is active and ready' : 'Server is awaiting administrator login',
  });
}

function getServerLoggedIn() {
  return isServerLoggedIn;
}

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve web admin panel static files
app.use('/admin', express.static(path.join(__dirname, 'public')));

// ── Health ─────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  serverReady: isServerLoggedIn,
  serverId: getServerId(),   // lets a client confirm an address really is this server
  ts: new Date().toISOString()
}));

// ── Public: list clinics for client dropdown (no auth) ───────
app.get('/api/public/hospitals', (req, res) => {
  const rows = listClients.all();
  res.json(rows.map(r => ({
    id           : r.id,
    client_name  : r.client_name,
    hospital_code: r.hospital_code,
  })));
});

// ── Public: get dept/blocks by clinic code (for client setup dropdown) ───
app.get('/api/public/departments/:hospitalCode', (req, res) => {
  const code = req.params.hospitalCode.trim().toUpperCase();
  // Return only type='department' rows to the client setup screen
  const rows = listDeptBlocksByHospital.all(code);
  res.json(rows);
});

// ── Public: server IP info (for client installer) ─────────────
app.get('/api/public/server-info', (req, res) => {
  const ips = getListeningIPs();
  const hospitalRow = listClients.all()[0]; // First clinic registered
  const bound = server.address();
  res.json({
    serverIp    : ips[0] || 'localhost',
    port        : bound && bound.port ? bound.port : PORT,
    hospitalName: hospitalRow ? hospitalRow.client_name : '',
    hospitalCode: hospitalRow ? hospitalRow.hospital_code : '',
  });
});

// ── License / activation ──────────────────────────────────────
// The server only holds the vendor's pre-baked PUBLIC keys bundled securely
// inside the application package (license-keys.js). It can verify Activation and
// Reset Codes but can never create them.
// By locking keys inside the binary, external file overrides are prevented.
function loadPublicKeys() {
  console.log('[License] Using secure bundled vendor public keys (license-keys.js).');
  return require('./license-keys');
}

const license = createLicense({
  store: {
    get: (k) => { const r = getSetting.get(k); return r ? r.value : null; },
    set: (k, v) => setSetting.run(k, v),
  },
  publicKeys: loadPublicKeys(),
});

// Activation and password-reset routes are only meant for the server's own login window,
// so other computers on the network cannot use them (or lock them with wrong guesses).
function localOnly(req, res, next) {
  const addr = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (addr === '127.0.0.1' || addr === '::1') return next();
  // When the server is bound to one specific IP, its own windows connect through that IP, so a request
  // coming from any of this computer's own addresses is also local.
  if (getLocalIPv4s().includes(addr)) return next();
  return res.status(403).json({ error: 'This action is only available on the server computer' });
}

function sendCheckFailure(res, r) {
  const body = { error: r.error };
  if (r.retryAfterSec) { res.set('Retry-After', String(r.retryAfterSec)); body.retryAfterSec = r.retryAfterSec; }
  return res.status(r.status).json(body);
}

// GET /api/public/install-status  → { activated, requestCode, licensee?, expiresOn?, reason? }
app.get('/api/public/install-status', localOnly, (req, res) => {
  res.json(license.getStatus());
});

// POST /api/public/activate  { code }
app.post('/api/public/activate', localOnly, (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string' || code.length < 20 || code.length > 600)
    return res.status(400).json({ error: 'Paste the full Activation Code' });
  const r = license.activate(code);
  if (!r.ok) return sendCheckFailure(res, r);
  console.log('[License] Server activated');
  res.json({ ok: true, status: r.status });
});

// GET /api/public/reset-request  → { requestCode, currentUsername }  (code the vendor needs for an admin password reset)
app.get('/api/public/reset-request', localOnly, (req, res) => {
  if (!license.isActivated()) return res.status(403).json({ error: 'Activate the server first', activationRequired: true });
  const admin = db.prepare('SELECT username FROM admin_users ORDER BY id LIMIT 1').get();
  res.json({
    requestCode: license.resetRequestCode(),
    currentUsername: admin ? admin.username : 'admin',
  });
});

// POST /api/public/reset-admin-password  { code, newPassword, newUsername }
app.post('/api/public/reset-admin-password', localOnly, (req, res) => {
  const { code, newPassword, newUsername } = req.body || {};
  if (!license.isActivated()) return res.status(403).json({ error: 'Activate the server first', activationRequired: true });
  if (typeof code !== 'string' || code.length < 20 || code.length > 600)
    return res.status(400).json({ error: 'Paste the full Reset Code' });
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128 || newPassword === DEFAULT_ADMIN_PASSWORD)
    return res.status(400).json({ error: 'New password must be 8–128 characters and not the default password' });

  const r = license.checkReset(code);
  if (!r.ok) return sendCheckFailure(res, r);

  const admin = db.prepare('SELECT id, username FROM admin_users ORDER BY id LIMIT 1').get();
  const hash = bcrypt.hashSync(newPassword, 12);
  let activeUsername = 'admin';

  if (newUsername && typeof newUsername === 'string' && newUsername.trim()) {
    const trimmed = newUsername.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
    }
    activeUsername = trimmed;
  } else if (admin && admin.username) {
    activeUsername = admin.username;
  }

  if (admin) {
    updateAdminCredentials.run(activeUsername, hash, admin.id);
  } else {
    // Fresh install with no bootstrap.env: the vendor Reset Code creates the first admin account.
    db.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run(activeUsername, hash);
    console.log('[License] Admin account created with vendor code');
  }
  license.consumeReset();
  console.log('[License] Admin credentials reset with vendor code');
  res.json({
    message: `Credentials reset successfully. Sign in with username "${activeUsername}" and your new password.`,
    username: activeUsername,
  });
});

// ══════════════════════════════════════════════════════════════
//  ADMIN WEB PANEL ROUTES  (served to browser, protected by JWT)
// ══════════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!license.isActivated())
    return res.status(403).json({ error: 'This server is not activated', activationRequired: true });
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  const result = adminLogin(username, password);
  if (!result) {
    eventLog.warn('admin_login_failed', { ip: req.ip });   // never log the attempted username/password
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  eventLog.info('admin_login_ok', { ip: req.ip });
  res.json(result);
});

// POST /api/admin/refresh - a fresh admin token for an open admin panel, so a panel left open for many
// hours is not bounced to the login window (which would also switch the alarm system off for every client).
app.post('/api/admin/refresh', requireAdmin, (req, res) => {
  const user = findAdmin.get(req.admin.username);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ token: signAdminToken({ id: user.id, username: user.username, ...(req.admin.mustChangePassword && { mustChangePassword: true }) }) });
});

// POST /api/admin/change-password (supports updating Username and/or Password)
app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword, newUsername } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword)
    return res.status(400).json({ error: 'Current password is required to save changes' });

  const user = findAdmin.get(req.admin.username);
  if (!user || !bcrypt.compareSync(currentPassword, user.password))
    return res.status(400).json({ error: 'Current password is incorrect' });

  let targetUsername = user.username;
  if (newUsername && typeof newUsername === 'string' && newUsername.trim()) {
    const trimmed = newUsername.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
    }
    const existing = findAdmin.get(trimmed);
    if (existing && existing.id !== user.id) {
      return res.status(400).json({ error: `Username "${trimmed}" is already in use by another account` });
    }
    targetUsername = trimmed;
  }

  let targetHash = user.password;
  if (newPassword && typeof newPassword === 'string' && newPassword.trim()) {
    if (newPassword.length < 8 || newPassword.length > 128)
      return res.status(400).json({ error: 'New password must be 8–128 characters' });
    if (newPassword === DEFAULT_ADMIN_PASSWORD)
      return res.status(400).json({ error: 'Choose a password different from the default one' });
    targetHash = bcrypt.hashSync(newPassword, 12);
  }

  updateAdminCredentials.run(targetUsername, targetHash, user.id);
  res.json({ ok: true, username: targetUsername, message: 'Admin account credentials updated successfully' });
});

// ── Client management ──────────────────────────────────────────

// GET /api/admin/clients
app.get('/api/admin/clients', requireAdmin, (req, res) => {
  const clients = listClients.all();
  const result  = clients.map(c => ({
    ...c,
    user_count: countClientUsers.get(c.id).cnt,
  }));
  res.json(result);
});

// System Limit = max number of client PCs; whole number 1..10000, else 0 (invalid)
function parseLimit(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 0;
}

// POST /api/admin/clients  { client_name, hospital_code, system_limit, email, email_logs, email_reports, location }
app.post('/api/admin/clients', requireAdmin, (req, res) => {
  const { client_name, hospital_code, system_limit = 100, email = null, email_logs = 0, email_reports = 0, location = null } = req.body || {};
  if (!client_name || !hospital_code)
    return res.status(400).json({ error: 'client_name and hospital_code required' });
  const limit = parseLimit(system_limit);
  if (!limit) return res.status(400).json({ error: 'System Limit must be a whole number from 1 to 10000' });
  try {
    const r = createClient.run(
      client_name.trim(), hospital_code.trim().toUpperCase(), limit,
      email || null, email_logs ? 1 : 0, email_reports ? 1 : 0, location || null
    );
    res.status(201).json({ id: r.lastInsertRowid, message: 'Client created' });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Clinic code already exists' });
    throw e;
  }
});

// PUT /api/admin/clients/:id
app.put('/api/admin/clients/:id', requireAdmin, (req, res) => {
  const { client_name, hospital_code, system_limit, email, email_logs, email_reports, location } = req.body || {};
  const c = findClientById.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Client not found' });
  const limit = system_limit === undefined || system_limit === '' ? c.system_limit : parseLimit(system_limit);
  if (!limit) return res.status(400).json({ error: 'System Limit must be a whole number from 1 to 10000' });
  updateClient.run(
    client_name  || c.client_name,
    (hospital_code || c.hospital_code).toUpperCase(),
    limit,
    email         !== undefined ? email         : c.email,
    email_logs    !== undefined ? (email_logs ? 1 : 0)   : c.email_logs,
    email_reports !== undefined ? (email_reports ? 1 : 0): c.email_reports,
    location      !== undefined ? (location || null)     : c.location,
    req.params.id
  );
  res.json({ message: 'Client updated' });
});

// DELETE /api/admin/clients/:id
app.delete('/api/admin/clients/:id', requireAdmin, (req, res) => {
  deleteClient.run(req.params.id);
  res.json({ message: 'Client removed' });
});

// ── Client-users management ────────────────────────────────────

// GET /api/admin/clients/:id/users  — :id may be numeric client id OR hospital_code
app.get('/api/admin/clients/:id/users', requireAdmin, (req, res) => {
  const param = req.params.id;
  // Resolve to numeric client_id — try hospital_code first, fall back to numeric id
  let clientId = param;
  if (isNaN(param)) {
    const c = findClientByCode.get(param.toUpperCase());
    if (!c) return res.json([]);
    clientId = c.id;
  }
  res.json(listClientUsers.all(clientId));
});

// POST /api/admin/clients/:id/users  (admin can add users manually)
app.post('/api/admin/clients/:id/users', requireAdmin, (req, res) => {
  const client = findClientById.get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const { user_id, room_number, system_number, user_name, role = 'staff', department = null } = req.body || {};
  const normalizedRole = normalizeRole(role);
  const room = checkRoom(normalizedRole, room_number);
  if (room.error) return res.status(400).json({ error: room.error });
  if (countClientUsers.get(client.id).cnt >= client.system_limit)
    return res.status(403).json({ error: `Maximum client limit reached (${client.system_limit}). Increase the System Limit of this clinic to add more.` });
  const uid  = String(user_id ?? '').trim();
  const name = String(user_name ?? '').trim() || roleTitle(normalizedRole);
  if (uid && findClientUserByUserId.get(uid, client.hospital_code))
    return res.status(409).json({ error: `User ID "${uid}" already exists in this clinic` });
  const deviceId = 'admin-' + uuidv4();
  const token    = signClientToken({
    deviceId, hospital_code: client.hospital_code,
    user_id: uid, room_number: room.value, system_number: system_number || '', user_name: name, role: normalizedRole,
  });
  createClientUserAdmin.run(
    client.id, client.hospital_code, uid,
    room.value, system_number || '', name, normalizedRole,
    deviceId, token, department || null,
  );
  res.status(201).json({ message: 'User added', token, deviceId });
});

// PUT /api/admin/client-users/:id
app.put('/api/admin/client-users/:id', requireAdmin, (req, res) => {
  const u = findClientUserById.get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { user_id, room_number, system_number, user_name, role, department } = req.body || {};
  if (user_id && user_id !== u.user_id) {
    const existing = findClientUserByUserId.get(user_id, u.hospital_code);
    if (existing && existing.id !== u.id)
      return res.status(409).json({ error: `User ID "${user_id}" already exists in this clinic` });
  }
  const normalizedRole = normalizeRole(role || u.role);
  let roomValue = u.room_number;
  if (room_number !== undefined || role !== undefined) {
    const room = checkRoom(normalizedRole, room_number !== undefined ? room_number : u.room_number);
    if (room.error) return res.status(400).json({ error: room.error });
    roomValue = room.value;
  }
  // Names are derived from the role; follow a role change unless an admin set a custom name
  const nameValue = user_name !== undefined ? (user_name || u.user_name)
    : (u.user_name === roleTitle(u.role) ? roleTitle(normalizedRole) : u.user_name);
  updateClientUser.run(
    user_id       !== undefined ? user_id       : u.user_id,
    roomValue,
    system_number !== undefined ? system_number : u.system_number,
    nameValue,
    normalizedRole,
    department    !== undefined ? department    : u.department,
    req.params.id
  );
  res.json({ message: 'User updated' });
});

// DELETE /api/admin/client-users/:id
app.delete('/api/admin/client-users/:id', requireAdmin, (req, res) => {
  deleteClientUser.run(req.params.id);
  res.json({ message: 'User removed' });
});

// ── Location management (type='location') ─────────────────────

// GET /api/admin/locations
app.get('/api/admin/locations', requireAdmin, (req, res) => {
  const { hospital_code } = req.query;
  if (hospital_code) return res.json(listLocationsByHospital.all(hospital_code.toUpperCase()));
  res.json(listLocations.all());
});

// POST /api/admin/locations  { hospital_code, name }
app.post('/api/admin/locations', requireAdmin, (req, res) => {
  const { hospital_code, name } = req.body || {};
  if (!hospital_code || !name)
    return res.status(400).json({ error: 'hospital_code and name required' });
  try {
    const code = hospital_code.trim().toUpperCase();
    const r = createDepartment.run(code, name.trim(), 'location');
    // Auto-set this location on the client if it has no location yet
    setClientLocation.run(name.trim(), code);
    res.status(201).json({ id: r.lastInsertRowid, message: 'Location created' });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Location already exists for this clinic' });
    throw e;
  }
});

// PUT /api/admin/locations/:id
app.put('/api/admin/locations/:id', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  const d = findDepartmentById.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Location not found' });
  if (!name) return res.status(400).json({ error: 'name required' });
  updateDepartment.run(name.trim(), req.params.id);
  res.json({ message: 'Location updated' });
});

// DELETE /api/admin/locations/:id
app.delete('/api/admin/locations/:id', requireAdmin, (req, res) => {
  deleteDepartment.run(req.params.id);
  res.json({ message: 'Location removed' });
});

// ── Department/Block management (type='department') ───────────

// GET /api/admin/dept-blocks
app.get('/api/admin/dept-blocks', requireAdmin, (req, res) => {
  const { hospital_code } = req.query;
  if (hospital_code) return res.json(listDeptBlocksByHospital.all(hospital_code.toUpperCase()));
  res.json(listDeptBlocks.all());
});

// POST /api/admin/dept-blocks  { hospital_code, name }
app.post('/api/admin/dept-blocks', requireAdmin, (req, res) => {
  const { hospital_code, name } = req.body || {};
  if (!hospital_code || !name)
    return res.status(400).json({ error: 'hospital_code and name required' });
  try {
    const code = hospital_code.trim().toUpperCase();
    const r = createDepartment.run(code, name.trim(), 'department');
    res.status(201).json({ id: r.lastInsertRowid, message: 'Department created' });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Department already exists for this clinic' });
    throw e;
  }
});

// PUT /api/admin/dept-blocks/:id
app.put('/api/admin/dept-blocks/:id', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  const d = findDepartmentById.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Department not found' });
  if (!name) return res.status(400).json({ error: 'name required' });
  updateDepartment.run(name.trim(), req.params.id);
  res.json({ message: 'Department updated' });
});

// DELETE /api/admin/dept-blocks/:id
app.delete('/api/admin/dept-blocks/:id', requireAdmin, (req, res) => {
  deleteDepartment.run(req.params.id);
  res.json({ message: 'Department removed' });
});

// ── Logs ───────────────────────────────────────────────────────

// One row per RECEIVING station per alarm (see alarm-logs.js). Filters: hospital_code, from, to (ISO times).
app.get('/api/admin/logs', requireAdmin, (req, res) => {
  const r = queryLogRows({ hospital: req.query.hospital_code, from: req.query.from, to: req.query.to, view: req.query.view, limit: 500 });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r.rows);
});

// Browser time-zone offset in minutes west of UTC (JS getTimezoneOffset), used to print local times in exports
function parseTzOffset(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= -840 && n <= 840 ? n : 0;
}
const exportStamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

// GET /api/admin/logs/export — CSV download of the same rows
app.get('/api/admin/logs/export', requireAdmin, (req, res) => {
  const r = queryLogRows({ hospital: req.query.hospital_code, from: req.query.from, to: req.query.to, view: req.query.view, limit: 5000 });
  if (r.error) return res.status(400).json({ error: r.error });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="alarm-logs-${exportStamp()}.csv"`);
  res.send(toCsv(r.rows, parseTzOffset(req.query.tz)));
});

// GET /api/admin/smtp-status — whether e-mail is set up (never returns the password)
app.get('/api/admin/smtp-status', requireAdmin, (req, res) => res.json(mailer.publicStatus()));

// POST /api/admin/logs/email { emails, hospital_code, from, to, tz } — the CSV is sent as an attachment (SMTP)
app.post('/api/admin/logs/email', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const to = mailer.parseRecipients(b.emails);
  if (!to.length) return res.status(400).json({ error: `Enter 1 to ${mailer.MAX_RECIPIENTS} valid e-mail addresses` });
  if (!mailer.isConfigured()) return res.status(503).json({ error: 'E-mail (SMTP) is not configured on this server. See server.env.' });
  const r = queryLogRows({ hospital: b.hospital_code, from: b.from, to: b.to, view: b.view, limit: 5000 });
  if (r.error) return res.status(400).json({ error: r.error });
  try {
    await mailer.sendMail({
      to: to.join(','),
      subject: 'Panic Alarm - alarm logs',
      text: `Alarm logs attached (${r.rows.length} row${r.rows.length === 1 ? '' : 's'}).`,
      attachments: [{ filename: `alarm-logs-${exportStamp()}.csv`, content: toCsv(r.rows, parseTzOffset(b.tz)), contentType: 'text/csv; charset=utf-8' }],
    });
    eventLog.info('log_export_emailed', { recipients: to.length, rows: r.rows.length });
    res.json({ message: `Logs sent to ${to.length} recipient${to.length === 1 ? '' : 's'}` });
  } catch (e) {
    eventLog.error('log_export_email_failed', { code: e.code || e.responseCode || 'ERR' });
    res.status(502).json({ error: 'Could not send the e-mail. Check the SMTP settings in server.env.' });
  }
});

// Clear = hide from ONE view ({view:'dash'|'logs'}); the other view and Reports keep the alarm
app.delete('/api/admin/logs', requireAdmin, (req, res) => {
  const { ids, all, view } = req.body || {};
  if (view !== 'dash' && view !== 'logs') return res.status(400).json({ error: 'view must be dash or logs' });
  if (all) {
    return res.json({ deleted: (view === 'dash' ? hideAllDash : hideAllLogs).run().changes });
  }
  if (Array.isArray(ids) && ids.length > 0) {
    const hide = view === 'dash' ? hideLogDash : hideLogLogs;
    const run = db.transaction((list) => {
      let n = 0;
      for (const id of list) n += hide.run(String(id)).changes;
      return n;
    });
    return res.json({ deleted: run(ids) });
  }
  res.status(400).json({ error: 'Provide ids[] or all:true' });
});

// ── Settings ───────────────────────────────────────────────────

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const allSettings = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  allSettings.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key required' });
  setSetting.run(key, String(value));
  res.json({ message: 'Setting saved' });
});

// GET /api/admin/network-info — current active IP(s), running port, and configured port
async function getNetworkInfo() {
  const bound = server.address();
  const activePort = bound ? bound.port : PORT;
  const ips = await refreshUsableIPs();   // only addresses that can really be listened on right now
  const savedHost = readSetting('server_host_admin');
  const savedPort = parseInt(readSetting('server_port_admin'), 10) || 0;
  return {
    clientUrlNotice: getClientUrlNotice(),   // set while clients still have to be told the new address
    ipWait: getIpWaitInfo(),                 // set while the server waits for its saved IP (admin must decide)
    activePort,
    activeHost: HOST,
    ips,
    primaryIp: HOST !== '0.0.0.0' ? HOST : (ips[0] || 'localhost'),
    configuredHost: savedHost || '0.0.0.0',
    configuredPort: savedPort || activePort,
    configuredIpAvailable: !savedHost || ips.includes(savedHost),
    fallbackFrom: hostFallbackFrom,   // saved/env IP that was unavailable at startup (server listens on all interfaces instead)
    isAutoPort: false,
    dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'panic_alarm.db'),
  };
}

app.get('/api/admin/network-info', requireAdmin, async (req, res) => {
  res.json(await getNetworkInfo());
});

// The notice stays until the admin confirms every client was updated
app.post('/api/admin/client-url-notice/dismiss', requireAdmin, (req, res) => {
  clearClientUrlNotice();
  eventLog.info('client_url_notice_dismissed');
  res.json({ ok: true });
});

// Helper to test if a port is currently available on a host before saving
function testPortAvailability(portNum, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve({ available: false, error: `Port ${portNum} is currently in use by another program on this computer. Please choose another port.` });
        } else {
          resolve({ available: false, error: `Cannot bind to port ${portNum}: ${err.message}` });
        }
      })
      .once('listening', () => {
        tester.once('close', () => resolve({ available: true })).close();
      })
      .listen(portNum, host);
  });
}

// ── "Clients must update" notice ───────────────────────────────
// Client apps connect to http://<server-ip>:<port>. Whenever that address changes (admin edit, or the IP/port
// changed by itself between runs) a notice is stored until the admin dismisses it, so it can be shown in the
// tray, the Edit IP window and the admin panel.
function urlsFor(host, port, ips) {
  const list = host === '0.0.0.0' ? ips : [host];
  return (list.length ? list : ['localhost']).map(ip => `http://${ip}:${port}`);
}
function getClientUrlNotice() {
  try { const v = readSetting('client_url_notice'); return v ? JSON.parse(v) : null; } catch { return null; }
}
function setClientUrlNotice(n) {
  try { setSetting.run('client_url_notice', n ? JSON.stringify(n) : ''); } catch { /* best effort */ }
}
function clearClientUrlNotice() { setClientUrlNotice(null); }

// Validate and save the IP + port the server listens on from the next start.
// host: '' or '0.0.0.0' = all interfaces, otherwise one IP that is usable right now.
async function applyNetworkConfig({ host, port }) {
  const wantHost = (typeof host === 'string' ? host.trim() : '') || '0.0.0.0';
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1024 || portNum > 65535)
    return { ok: false, error: 'Port must be a valid number between 1024 and 65535.' };

  if (wantHost !== '0.0.0.0') {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(wantHost)) return { ok: false, error: 'Enter a valid IPv4 address.' };
    const ips = await refreshUsableIPs();
    if (!ips.includes(wantHost))
      return { ok: false, error: `IP address ${wantHost} is not available on this computer right now (adapter disabled or disconnected). Available: ${ips.join(', ') || 'none'}.` };
  }

  // The port this process already holds is fine; any other one must be free on the chosen address
  const bound = server.address();
  if (!(bound && bound.port === portNum)) {
    const check = await testPortAvailability(portNum, wantHost);
    if (!check.available) return { ok: false, error: check.error };
  }

  // Will the address clients use today still work after this change?
  // While waiting for the saved IP, "today" means that IP (the one clients still have), not the local-only listener.
  const waiting = !!ipWait;
  const oldUrl = waiting
    ? `http://${ipWait.ip}:${ipWait.port}`
    : urlsFor(HOST, bound ? bound.port : PORT, getListeningIPs())[0];
  const newUrls = urlsFor(wantHost, portNum, usableIpCache);
  const newUrl = newUrls[0];
  const urlChanged = !newUrls.includes(oldUrl);

  setSetting.run('server_host_admin', wantHost === '0.0.0.0' ? '' : wantHost);
  setSetting.run('server_port_admin', String(portNum));
  setSetting.run('server_port', String(portNum));
  eventLog.info('network_config_saved', { host: wantHost, port: portNum, urlChanged, live: waiting });

  if (urlChanged) {
    setClientUrlNotice({ from: oldUrl, to: newUrl, at: new Date().toISOString(), applied: waiting });
    eventLog.warn(waiting ? 'client_url_changed' : 'client_url_will_change', { from: oldUrl, to: newUrl });
    // Connected clients are told the new address NOW, before it takes effect, so they can follow by themselves
    broadcastServerAddresses(newUrls, portNum);
  } else {
    const n = getClientUrlNotice();
    if (n && !n.applied) clearClientUrlNotice();   // the admin changed it back before restarting
  }
  // Waiting for an IP: switch right away, no application restart needed (connected clients keep their sockets)
  if (waiting) {
    setSetting.run('last_client_url', newUrl);
    completeIpWait(wantHost, portNum);
  }
  return { ok: true, host: wantHost, port: portNum, urlChanged, oldUrl, newUrl, live: waiting };
}

// Find an available port (checking startPort, otherwise auto-allocating)
function findAvailablePort(startPort = 5000) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => {
        const autoTester = net.createServer()
          .once('error', () => resolve(5000))
          .once('listening', () => {
            const p = autoTester.address().port;
            autoTester.once('close', () => resolve(p)).close();
          });
        autoTester.listen(0, '0.0.0.0');
      })
      .once('listening', () => {
        tester.once('close', () => resolve(startPort)).close();
      });
    tester.listen(startPort, '0.0.0.0');
  });
}

function savePortSetting(portNum) {
  try {
    setSetting.run('server_port', String(portNum));
    setSetting.run('server_port_admin', String(portNum));
    process.env.PORT = String(portNum);
    return true;
  } catch (e) {
    console.error('[Server] Failed to save port setting:', e.message);
    return false;
  }
}

// ── Admin Server Control: Restart & Stop Endpoints ─────────────
app.post('/api/admin/restart-server', requireAdmin, (req, res) => {
  res.json({ ok: true, message: 'Server is restarting...' });
  setTimeout(() => {
    if (global.__restartServerApp) global.__restartServerApp();
  }, 200);
});

app.post('/api/admin/stop-server', requireAdmin, (req, res) => {
  res.json({ ok: true, message: 'Server is stopping...' });
  setTimeout(() => {
    if (global.__stopServerApp) global.__stopServerApp();
  }, 200);
});

// POST /api/admin/network-settings  { host, port } — validate (IP exists, port free) and save for the next start
// (or apply right away when the server is waiting for its IP)
app.post('/api/admin/network-settings', requireAdmin, async (req, res) => {
  const { port, autoPort, host } = req.body || {};
  const r = await applyNetworkConfig({ host, port: autoPort ? await findAvailablePort(5000) : port });
  if (!r.ok) return res.status(400).json({ error: r.error });
  const where = `${r.host === '0.0.0.0' ? 'all network interfaces' : r.host}, port ${r.port}`;
  return res.json({
    message: (r.live ? `Now using ${where}.` : `Saved: ${where}. Restart the server application for the change to take effect.`) +
      (r.urlChanged ? ` IMPORTANT: the client address changes from ${r.oldUrl} to ${r.newUrl}. Running clients are told the new address automatically; any that are not running or cannot follow must be updated by hand.` : ''),
    host: r.host,
    port: r.port,
    restartRequired: !r.live,
    urlChanged: r.urlChanged,
    oldUrl: r.oldUrl,
    newUrl: r.newUrl,
  });
});

// POST /api/admin/ip-wait  { action: 'wait' | 'use-next' } — the admin's answer while the server waits for its IP
app.post('/api/admin/ip-wait', requireAdmin, async (req, res) => {
  const action = String((req.body || {}).action || '');
  const r = await ipWaitAction(action, (req.body || {}).ip);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, message: r.message || `Now using ${r.newUrl}.`, urlChanged: !!r.urlChanged, newUrl: r.newUrl, oldUrl: r.oldUrl });
});

// ══════════════════════════════════════════════════════════════
//  CLIENT API  (called from Electron desktop app)
// ══════════════════════════════════════════════════════════════

const CLIENT_LIMIT_MSG = 'Unable to connect. Maximum client connection limit reached. Please contact your software provider for assistance.';

// POST /api/client/register  — called once at first-run wizard
app.post('/api/client/register', (req, res) => {
  const {
    hospital_code, room_number, system_number,
    role = 'staff', device_id, department = null,
  } = req.body || {};

  if (!hospital_code || !device_id)
    return res.status(400).json({ error: 'Required: hospital_code, device_id' });

  const normalizedRole = normalizeRole(role);
  const room = checkRoom(normalizedRole, room_number);
  if (room.error) return res.status(400).json({ error: room.error });
  const name = roleTitle(normalizedRole);
  const uid  = '';

  const code   = hospital_code.trim().toUpperCase();
  const client = findClientByCode.get(code);
  if (!client) return res.status(404).json({ error: 'Clinic code not recognised. Contact your administrator.' });

  // System limit (Add Client > System Limit): a NEW device, or one an admin deactivated, needs a free slot.
  // Devices that are already active can always re-register (restart, role/room change).
  const { cnt } = countClientUsers.get(client.id);
  const existingDevice = findClientUser.get(device_id);

  if ((!existingDevice || !existingDevice.active) && cnt >= client.system_limit) {
    eventLog.warn('client_limit_reached', { hospital: code, limit: client.system_limit });
    return res.status(403).json({ error: CLIENT_LIMIT_MSG });
  }

  const token = signClientToken({
    deviceId: device_id, hospital_code: code, user_id: uid,
    room_number: room.value, system_number: system_number || '', user_name: name, role: normalizedRole,
  });

  if (existingDevice) {
    updateClientUser.run(uid, room.value, system_number || '', name, normalizedRole,
      department || existingDevice.department, existingDevice.id);
    updateClientUserToken.run(token, device_id);
    // Re-activate in case the record was deactivated by an admin
    db.prepare('UPDATE client_users SET active=1 WHERE device_id=?').run(device_id);
    io.to('admin').emit('user_registered', { hospitalCode: code, clientId: client.id });
    return res.json({
      message: 'Re-registered', token, deviceId: device_id,
      clientName: client.client_name, hospitalCode: code,
    });
  }

  createClientUser.run(client.id, code, uid, room.value, system_number || '', name, normalizedRole, 'client', device_id, token, department || null);
  io.to('admin').emit('user_registered', { hospitalCode: code, clientId: client.id });
  res.status(201).json({
    message: 'Registered', token, deviceId: device_id,
    clientName: client.client_name, hospitalCode: code,
  });
});

// GET /api/client/me
app.get('/api/client/me', requireClient, (req, res) => {
  const u = findClientUser.get(req.clientUser.deviceId);
  if (!u || !u.active) return res.status(404).json({ error: 'Client not found or deactivated' });
  res.json(u);
});

// PUT /api/client/me
app.put('/api/client/me', requireClient, (req, res) => {
  const u = findClientUser.get(req.clientUser.deviceId);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const { room_number, system_number, role, department } = req.body || {};

  const normalizedRole = normalizeRole(role || u.role);
  const room = checkRoom(normalizedRole, room_number !== undefined ? room_number : u.room_number);
  if (room.error) return res.status(400).json({ error: room.error });
  updateClientUser.run(
    u.user_id || '',
    room.value,
    system_number !== undefined ? system_number : u.system_number,
    roleTitle(normalizedRole),
    normalizedRole,
    department    !== undefined ? department : u.department,
    u.id
  );
  const updated = findClientUser.get(req.clientUser.deviceId);
  const newToken = signClientToken({
    deviceId: updated.device_id, hospital_code: updated.hospital_code,
    user_id: updated.user_id,
    room_number: updated.room_number, system_number: updated.system_number,
    user_name: updated.user_name, role: updated.role,
  });
  updateClientUserToken.run(newToken, updated.device_id);
  res.json({ message: 'Updated', token: newToken });
});

// POST /api/client/event — clients report outages they experienced (sent after they reconnect,
// because a down server cannot receive anything). Allowlisted types only; fields are length-limited.
const CLIENT_EVENT_TYPES = new Set(['server_unreachable', 'alarm_delivery_failed', 'client_started']);
const lastClientEvent = new Map();   // deviceId -> timestamp, simple flood guard
app.post('/api/client/event', requireClient, (req, res) => {
  const { type, since, until, detail } = req.body || {};
  if (!CLIENT_EVENT_TYPES.has(type)) return res.status(400).json({ error: 'Unknown event type' });
  const u = req.clientUser;
  const key = u.deviceId || u.user_name;
  const now = Date.now();
  if (now - (lastClientEvent.get(key) || 0) < 1000) return res.status(429).json({ error: 'Too many events' });
  lastClientEvent.set(key, now);
  if (lastClientEvent.size > 1000) {
    for (const [k, t] of lastClientEvent) if (now - t > 60 * 1000) lastClientEvent.delete(k);
  }
  eventLog.warn(`client_${type}`, {
    hospital: u.hospital_code, deviceId: u.deviceId, user: u.user_name,
    since, until, detail,
  });
  res.json({ ok: true });
});

// POST /api/client/alarm/trigger
const recentAlarmFromDevice = db.prepare(
  `SELECT 1 FROM alarm_log WHERE device_id = ? AND alarm_id <> ? AND delivered_count > 0 AND triggered_at >= datetime('now', '-60 seconds') LIMIT 1`);
const deleteRecipientsOfAlarm = db.prepare('DELETE FROM alarm_recipient WHERE alarm_id = ?');
const lastAlarmByDevice = new Map();   // deviceId -> timestamp of last accepted alarm
const ALARM_LOCK_MS = 20 * 1000;
const ALARM_ACK_TIMEOUT_MS = 2000;   // how long to wait for stations to confirm they displayed the alarm (must stay below the button's request timeout)

// OS user name reported by a client (informational only): printable, no control characters, at most 40 chars
function cleanOsUser(v) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f<>"'`]/g, '').trim().slice(0, 40);
}

// Tell the admin panel an alarm's rows changed (live refresh of Logs / Dashboard)
function emitAlarmUpdated(alarmId) {
  try { io.to('admin').emit('alarm_updated', { alarmId }); } catch { /* best effort */ }
}

// Every alarm is e-mailed to the clinic's contact address (SMTP). Never blocks or fails the alarm itself.
async function emailAlarm(alarmId) {
  if (!mailer.isConfigured()) return;
  try {
    const mail = buildAlarmEmail(alarmId);
    if (!mail) return;
    const to = new Set(mailer.parseRecipients(mail.hospital && mail.hospital.email));
    for (const e of mailer.parseRecipients(process.env.ALARM_EMAIL_TO)) to.add(e);
    if (!to.size) return;
    await mailer.sendMail({ to: [...to].join(','), subject: mail.subject, text: mail.text, html: mail.html });
    eventLog.info('alarm_email_sent', { alarmId, recipients: to.size });
  } catch (e) {
    eventLog.error('alarm_email_failed', { alarmId, code: e.code || e.responseCode || 'ERR' });
  }
}

// Who and where a receiving station is. Role and room come from the server's own registration record for
// that device (never from what the connection claims); only the OS user name is reported by the client.
function stationOf(socketData) {
  const deviceId = String((socketData && socketData.deviceId) || '');
  const reg = deviceId ? findClientUser.get(deviceId) : null;
  const role = normalizeRole(reg && reg.role);
  return {
    deviceId,
    osUser: cleanOsUser(socketData && socketData.osUser),
    title : reg ? roleTitle(role) : 'Station',
    room  : reg ? roomLabel(role, reg.room_number) : '',
  };
}

app.post('/api/client/alarm/trigger', requireClient, async (req, res) => {
  const u = req.clientUser;

  // Server-side lock: one alarm per device per 20 s (matches the solid button on the client)
  const lockKey = u.deviceId || u.user_id || u.user_name;
  const now = Date.now();
  const last = lastAlarmByDevice.get(lockKey);
  if (last && now - last < ALARM_LOCK_MS) {
    return res.json({ ignored: true });   // silently ignored — nothing is logged or broadcast
  }
  lastAlarmByDevice.set(lockKey, now);
  if (lastAlarmByDevice.size > 1000) {
    for (const [k, t] of lastAlarmByDevice) if (now - t >= ALARM_LOCK_MS) lastAlarmByDevice.delete(k);
  }

  const alarmId  = uuidv4();
  const userId   = u.user_id || u.userId || '';
  const role     = normalizeRole(u.role);
  const title    = roleTitle(role);
  const location = roomLabel(role, u.room_number);
  const message  = `🚨 PANIC ALARM — ${title} (${location}) needs IMMEDIATE HELP!`;
  const severity = 'PANIC';
  let senderOsUser = cleanOsUser(req.body && req.body.osUser);
  if (!senderOsUser && u.deviceId) {
    // The press arrived without the OS user (e.g. an older client build). Use the OS user that THIS device's
    // own client reported when it connected - but only when that is unambiguous (one user on the device).
    try {
      const mine = new Set((await io.in(`hospital_${(u.hospital_code || '').toString().trim().toUpperCase()}`).fetchSockets())
        .filter(sk => sk.data && sk.data.deviceId === u.deviceId && sk.data.osUser).map(sk => sk.data.osUser));
      if (mine.size === 1) senderOsUser = [...mine][0];
    } catch { /* best effort */ }
  }

  insertLog.run(alarmId, u.hospital_code, title, userId, location, u.system_number || '', u.deviceId, severity, message, senderOsUser);

  const hCode = (u.hospital_code || '').toString().trim().toUpperCase();
  const roomName = `hospital_${hCode}`;

  const alarmPayload = {
    alarmId,
    hospitalCode : hCode,
    triggeredBy  : title,
    senderOsUser,
    role,
    userId       : userId,
    roomNumber   : u.room_number,
    locationLabel: location,
    systemNumber : u.system_number,
    deviceId     : u.deviceId,
    severity,
    message,
    triggeredAt  : new Date().toISOString(),
  };

  // Also push to admin panel room (the admin panel is not a station — it does not count as delivery)
  io.to('admin').emit('panic_alarm', alarmPayload);

  // Popup auto-closes after 20 s. If no OK / No-Response arrives by then
  // (e.g. nobody online, popup crashed) settle the alarm so it never stays "Active".
  setTimeout(() => {
    try { markNoResponse.run(alarmId); settleRecipients.run(alarmId); emitAlarmUpdated(alarmId); }
    catch (e) { console.error('[ALARM] settle failed', e.message); }
  }, ALARM_SETTLE_MS);

  // ── Deliver to the OTHER stations of this clinic and find out who really received it ──
  // The sender's own PC is excluded (all OS users on one PC share a device id). "Delivered" means a
  // station CONFIRMED it displayed the alarm — a press the server merely accepted is not delivery.
  let recipients = [];
  try {
    recipients = (await io.in(roomName).fetchSockets())
      .filter(s => !(u.deviceId && s.data && s.data.deviceId === u.deviceId));
  } catch (e) { console.error('[ALARM] could not list recipients', e.message); }

  // One record per receiving station (device + OS user), saved BEFORE the alarm goes out so that an
  // early OK always finds its row. Every record starts as "delivered" and is downgraded below if the
  // station did not confirm.
  const stations = new Map();   // socket id -> station
  const saveStations = db.transaction((list) => {
    for (const s of list) {
      const st = stationOf(s.data);
      stations.set(s.id, st);
      insertRecipient.run(alarmId, hCode, st.deviceId, st.osUser, st.title, st.room, 'delivered');
    }
  });
  try { saveStations(recipients); } catch (e) { console.error('[ALARM] could not save recipients', e.message); }

  const capable = recipients.filter(s => s.data && s.data.ackCapable);
  const legacy  = recipients.filter(s => !(s.data && s.data.ackCapable));   // older clients: cannot confirm

  if (legacy.length) io.to(legacy.map(s => s.id)).emit('panic_alarm', alarmPayload);

  // Which stations confirmed: socket.io's combined answer does not say who gave it, so every capable
  // socket is asked on its own and the result is matched to its station.
  const confirmedIds = new Set();
  if (capable.length) {
    await Promise.all(capable.map(s => new Promise((resolve) => {
      io.to(s.id).timeout(ALARM_ACK_TIMEOUT_MS).emit('panic_alarm', alarmPayload, (err, responses) => {
        if (!err && (responses || []).some(r => r && r.ok)) confirmedIds.add(s.id);
        resolve();
      });
    })));
  }

  // Stations that did not confirm are "Not Delivered" (an already-acknowledged station is left alone)
  try {
    for (const s of capable) {
      if (confirmedIds.has(s.id)) continue;
      const st = stations.get(s.id);
      if (st) notDeliveredRecipient.run(alarmId, st.deviceId, st.osUser);
    }
  } catch (e) { console.error('[ALARM] could not save delivery results', e.message); }

  // Connected older clients cannot confirm, so they are counted as reached (best available knowledge)
  const delivered = confirmedIds.size + legacy.length;
  try { setAlarmDelivered.run(delivered, alarmId); } catch (e) { console.error('[ALARM] could not save delivery', e.message); }

  // A repeat press shortly after an earlier alarm from the SAME device that WAS delivered, and which nobody
  // confirms this time, is only noise (double-clicking the button, a retry): record nothing in the logs and
  // send no e-mail for it. The sender still sees "NOT SENT!" and may press again; the server's own event
  // log keeps a line for it. A first alarm that nobody received is still recorded as Not Delivered.
  let repeatNoise = false;
  if (delivered === 0 && u.deviceId) {
    try {
      repeatNoise = !!recentAlarmFromDevice.get(u.deviceId, alarmId);
      if (repeatNoise) {
        db.transaction(() => { deleteRecipientsOfAlarm.run(alarmId); deleteLogById.run(alarmId); })();
      }
    } catch (e) { console.error('[ALARM] could not drop repeat press', e.message); repeatNoise = false; }
  }
  emitAlarmUpdated(alarmId);
  if (!repeatNoise) emailAlarm(alarmId);   // every recorded alarm, whatever its outcome; runs in the background

  if (delivered === 0) {
    // Nobody received it: do not let the sender believe help is coming, and let them press again at once
    lastAlarmByDevice.delete(lockKey);
    if (!repeatNoise) { try { markNoResponse.run(alarmId); } catch { /* best effort */ } }
    eventLog.error('alarm_not_delivered', { alarmId, hospital: hCode, deviceId: u.deviceId, connectedStations: recipients.length });
    console.warn(`[ALARM] NOT DELIVERED ${alarmId} | ${hCode} | ${location} | stations online: ${recipients.length}`);
    return res.json({ alarmId, delivered: 0, message: 'No other station received the alarm' });
  }

  eventLog.info('alarm_delivered', { alarmId, hospital: hCode, deviceId: u.deviceId, delivered });
  console.log(`[ALARM] ${new Date().toISOString()} | ${hCode} | ${title} | ${location} | delivered to ${delivered}`);
  res.json({ alarmId, delivered, message: 'Alarm sent' });
});

// A station may only report on alarms of its own clinic
function ownAlarm(u, alarmId) {
  const a = findAlarm.get(String(alarmId));
  return !!a && String(a.hospital_code || '').toUpperCase() === String(u.hospital_code || '').trim().toUpperCase();
}

// POST /api/client/alarm/acknowledge
app.post('/api/client/alarm/acknowledge', requireClient, (req, res) => {
  const { alarmId } = req.body || {};
  if (!alarmId) return res.status(400).json({ error: 'alarmId required' });
  const u = req.clientUser;
  if (!ownAlarm(u, alarmId)) return res.status(404).json({ error: 'Alarm not found' });
  const hCode = (u.hospital_code || '').toString().trim().toUpperCase();
  const osUser = cleanOsUser(req.body && req.body.osUser);
  const role = normalizeRole(u.role);
  const ackRoom = roomLabel(role, u.room_number);   // "Acked By" = the ROOM of the station that pressed OK

  // Mark this station's row; a client that sends no OS user is matched on its device alone
  let changed = osUser ? ackRecipient.run(alarmId, u.deviceId || '', osUser).changes : 0;
  if (!changed) changed = ackRecipientDevice.run(alarmId, u.deviceId || '').changes;
  if (!changed) {   // not recorded as a recipient (e.g. connected a moment too late) — still keep the acknowledgement
    insertRecipient.run(alarmId, hCode, u.deviceId || '', osUser, roleTitle(role), ackRoom, 'acked');
  }
  acknowledgeAlarm.run(ackRoom, alarmId);
  emitAlarmUpdated(alarmId);
  const ackedAt = new Date().toISOString();
  io.to(`hospital_${hCode}`).emit('alarm_acknowledged', { alarmId, ackBy: ackRoom, ackAt: ackedAt });
  io.to('admin').emit('alarm_acknowledged', { alarmId, ackBy: ackRoom, ackAt: ackedAt });
  res.json({ message: 'Acknowledged' });
});

// POST /api/client/alarm/no-response  — called when alert auto-closes without OK
app.post('/api/client/alarm/no-response', requireClient, (req, res) => {
  const { alarmId } = req.body || {};
  if (!alarmId) return res.status(400).json({ error: 'alarmId required' });
  const u = req.clientUser;
  if (!ownAlarm(u, alarmId)) return res.status(404).json({ error: 'Alarm not found' });
  const osUser = cleanOsUser(req.body && req.body.osUser);
  // This station did not answer. The alarm as a whole only becomes "No Response" if nobody acknowledged it
  // (markNoResponse never touches an acknowledged alarm).
  const changed = osUser ? noRespRecipient.run(alarmId, u.deviceId || '', osUser).changes : 0;
  if (!changed) noRespRecipientDevice.run(alarmId, u.deviceId || '');
  markNoResponse.run(alarmId);
  emitAlarmUpdated(alarmId);
  console.log(`[NO-RESPONSE] ${new Date().toISOString()} | Alarm ${alarmId} | Device ${u.deviceId || u.user_name}`);
  res.json({ message: 'No-response recorded' });
});

// ── Socket.IO ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Connected: ${socket.id}`);
  eventLog.info('socket_connected', { socketId: socket.id, ip: socket.handshake && socket.handshake.address });

  // Immediately send current server readiness state to connecting client
  socket.emit('server_state', {
    ready: isServerLoggedIn,
    message: isServerLoggedIn ? 'Server is active and ready' : 'Server is awaiting administrator login',
  });
  // Every client learns the addresses of this server as soon as it connects (used if the address changes later)
  if (!ipWait) {
    const p = currentBoundPort();
    socket.emit('server_addresses', addressPayload(urlsFor(HOST, p, getListeningIPs()), p));
  }

  socket.on('join', (data) => {
    const code = (data && (data.hospitalCode || data.hospital_code || ''))
      .toString().trim().toUpperCase();
    // Store deviceId on socket for alarm exclusion
    if (data && data.deviceId) socket.data.deviceId = data.deviceId;
    // OS user signed in on that PC (informational: shown in the logs as Doctor(srini))
    socket.data.osUser = cleanOsUser(data && data.osUser);
    // Newer clients confirm each alarm they display; older ones cannot
    socket.data.ackCapable = !!(data && data.ackCapable);
    // Admin panel joins the special 'admin' room for server-push updates
    if (data && data.isAdmin) {
      socket.join('admin');
      console.log(`[WS] ${socket.id} joined admin room`);
      return;
    }
    if (code) {
      socket.join(`hospital_${code}`);
      console.log(`[WS] ${socket.id} joined hospital_${code} (${data.userName || data.user_name || ''})`);
    }
    // Acknowledge join with server readiness state
    socket.emit('server_state', {
      ready: isServerLoggedIn,
      message: isServerLoggedIn ? 'Server is active and ready' : 'Server is awaiting administrator login',
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[WS] Disconnected: ${socket.id}`);
    eventLog.info('socket_disconnected', { socketId: socket.id, deviceId: socket.data && socket.data.deviceId, reason });
  });
});

// ── Error handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────
// Handle port binding errors (e.g. EADDRINUSE)
server.on('error', (err) => {
  eventLog.error('server_listen_error', { code: err.code, port: PORT, host: HOST });
  if (err.code === 'EADDRNOTAVAIL' && HOST !== '0.0.0.0' && HOST !== '127.0.0.1') {
    // The IP vanished between the check and listen(): wait for it like at start-up (never jump to another IP)
    console.warn(`[Server] ${HOST} is not available - waiting for it`);
    hostFallbackFrom = HOST;
    startIpWait(HOST);
    HOST = '127.0.0.1';
    server.listen(PORT, HOST);
  } else if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} is already in use by another application!`);
    if (typeof global.__onServerPortError === 'function') {
      global.__onServerPortError(PORT, err);
    }
  } else {
    console.error('[Server] Server error:', err);
  }
});

// Watches the IP the server is meant to use. It never changes IP by itself until the wait ran out:
//   saved IP gone while serving  -> start waiting (clients keep their address, the IP may be back soon)
//   saved IP back while waiting  -> serve on it again, nothing changes for any client
//   admin not warned yet         -> after a short grace period tell the admin (tray dialog + admin panel)
//   180 s without an answer      -> serve on all available interfaces (clients get the new addresses pushed)
let missingIpChecks = 0;
setInterval(() => {
  refreshUsableIPs().then((ips) => {
    const wanted = readSetting('server_host_admin') || (process.env.HOST || '').trim();
    if (!ipWait) {
      if (!wanted || wanted === '0.0.0.0' || wanted === '127.0.0.1' || HOST !== wanted) return;
      // Two missed checks in a row (20 s) so one failed test-bind does not start a wait
      missingIpChecks = ips.includes(wanted) ? 0 : missingIpChecks + 1;
      if (missingIpChecks >= 2) {
        missingIpChecks = 0;
        eventLog.warn('bound_ip_lost', { ip: wanted });
        hostFallbackFrom = wanted;
        startIpWait(wanted);
        // The old listener may be dead: keep the tray / admin windows working through this computer only
        rebind('127.0.0.1', ipWait.port);
      }
      return;
    }
    const now = Date.now();
    if (ips.includes(ipWait.ip)) { finishIpWait('returned'); return; }
    if (now >= ipWait.deadline) { finishIpWait('timeout'); return; }
    if (!ipWait.warned && now - ipWait.since >= IP_WARN_AFTER_MS) {
      ipWait.warned = true;
      announceIpWait('started');
    } else if (ipWait.warned && !ipWait.reminded && ipWait.deadline - now <= 60 * 1000) {
      ipWait.reminded = true;
      announceIpWait('reminder');
    }
  }).catch(() => {});
}, 5 * 1000).unref();

// Decide the address from what really exists right now, then listen
refreshUsableIPs().catch(() => []).then((ips) => {
  HOST = resolveHost(ips);
  server.listen(PORT, HOST);
});

server.on('listening', () => {
  const bound = server.address();
  const actualPort = bound ? bound.port : PORT;
  eventLog.info('server_started', { port: actualPort, host: HOST, pid: process.pid });
  // Write the actual port back to the environment and database so it is retained on all restarts
  process.env.PORT = String(actualPort);
  try {
    const current = getSetting.get('server_port');
    if (!current || !current.value || current.value === '0') {
      setSetting.run('server_port', String(actualPort));
    }
  } catch {}

  const ips = getListeningIPs();

  // Compare with the address clients were using last time: if it changed on its own (saved IP gone, port
  // taken, DHCP gave a new IP...) clients can no longer find the server until they are updated.
  // While waiting for the saved IP the server only listens on this computer: nothing changes for clients yet.
  try {
    if (ipWait) throw new Error('waiting');
    const nowUrls = urlsFor(HOST, actualPort, ips);
    const last = readSetting('last_client_url');
    const existing = getClientUrlNotice();
    if (existing && existing.to && nowUrls.includes(existing.to)) {
      // The change the admin saved is now live
      if (!existing.applied) setClientUrlNotice({ ...existing, applied: true });
    } else if (last && !nowUrls.includes(last)) {
      // Changed by itself (saved IP gone, port taken, new IP from DHCP...)
      setClientUrlNotice({ from: last, to: nowUrls[0], at: new Date().toISOString(), applied: true, automatic: true });
      eventLog.warn('client_url_changed', { from: last, to: nowUrls[0] });
    }
    setSetting.run('last_client_url', nowUrls[0]);
    // Clients that are still connected learn the address now; the rest find it themselves (see client/main.js)
    broadcastServerAddresses(nowUrls, actualPort);
  } catch { /* best effort or waiting */ }

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🚨  PANIC ALARM SERVER — RUNNING  🚨           ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Port        : ${actualPort}`);
  console.log(`║  Intranet IP : ${ips.join(' | ') || 'N/A'}`);
  console.log(`║  Admin Panel : http://${ips[0] || 'localhost'}:${actualPort}/admin/`);
  console.log('║  DB          : SQLite ./data/panic_alarm.db');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});

process.on('SIGINT',  () => { eventLog.info('server_stopped', { signal: 'SIGINT' });  db.close(); process.exit(0); });
process.on('SIGTERM', () => { eventLog.info('server_stopped', { signal: 'SIGTERM' }); db.close(); process.exit(0); });

// Export the http server and helpers so server-main.js can interact with them.
module.exports = {
  server, app, io, testPortAvailability, findAvailablePort, savePortSetting, setServerLoggedIn, getServerLoggedIn,
  getNetworkInfo, applyNetworkConfig, getListeningIPs, getLocalHost, refreshUsableIPs,
  getClientUrlNotice, clearClientUrlNotice, getIpWaitInfo, ipWaitAction,
};

// ── Helpers ────────────────────────────────────────────────────
// Roles: doctor | nurse | staff. Older records used 'other', which now maps to staff.
function normalizeRole(role) {
  if (!role) return 'staff';
  const r = role.toString().toLowerCase().trim();
  if (r === 'doctor') return 'doctor';
  if (r === 'nurse')  return 'nurse';
  return 'staff';
}

const ROLE_TITLE = { doctor: 'Doctor', nurse: 'Nurse', staff: 'Staff' };
const ROOM_FIELD = { doctor: 'Consulting Room', nurse: 'Treatment Room' };
const RECEPTION = 'Reception Area';
const MGMT_PREFIX = 'Management Room: ';
const MAX_ROOM_LEN = 40;

function roleTitle(role) { return ROLE_TITLE[role] || 'Staff'; }

// Validates the role-specific location. Returns { value } or { error }.
function checkRoom(role, raw) {
  const v = String(raw ?? '').trim();
  if (role === 'staff') {
    // Reception Area needs no room number; Management Room is stored as "Management Room: <number>"
    if (v === RECEPTION) return { value: v };
    const m = v.match(/^Management Room(?::\s*(.*))?$/);
    if (!m) return { error: 'Select Reception Area or Management Room' };
    const num = (m[1] || '').trim();
    if (!num) return { error: 'Management Room number is required' };
    if (num.length > MAX_ROOM_LEN) return { error: `Management Room number must be ${MAX_ROOM_LEN} characters or less` };
    return { value: MGMT_PREFIX + num };
  }
  if (!v) return { error: `${ROOM_FIELD[role]} is required` };
  if (v.length > MAX_ROOM_LEN) return { error: `${ROOM_FIELD[role]} must be ${MAX_ROOM_LEN} characters or less` };
  return { value: v };
}

// Text shown in alerts and logs: "Consulting Room: 12", "Treatment Room: 5", "Reception Area", "Management Room: 3".
function roomLabel(role, room) {
  const v = String(room ?? '').trim();
  if (role === 'staff') return v || 'Staff';
  return `${ROOM_FIELD[role] || 'Room'}: ${v || '—'}`;
}
