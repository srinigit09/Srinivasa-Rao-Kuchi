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
const { createLicense } = require('./license');
const { requireAdmin, requireClient, adminLogin, signClientToken, signAdminToken, DEFAULT_ADMIN_PASSWORD } = require('./auth');
const {
  db,
  findAdmin, updateAdminPassword,
  listClients, findClientByCode, findClientById, createClient, updateClient, deleteClient, countClientUsers, setClientLocation,
  listClientUsers, findClientUser, findClientUserById, findClientUserByUserId,
  createClientUser, createClientUserAdmin, updateClientUser,
  updateClientUserToken, deleteClientUser,
  insertLog, acknowledgeAlarm, markNoResponse, settleStaleAlarms, listLogs, listLogsByHospital, listLogsByDate,
  deleteLogById, deleteAllLogs,
  getSetting, setSetting,
  listLocations, listLocationsByHospital,
  listDeptBlocks, listDeptBlocksByHospital,
  listDepartments, listDepartmentsByHospital, findDepartmentById, createDepartment, updateDepartment, deleteDepartment,
} = require('./db');

const ALARM_SETTLE_MS = 20 * 1000;   // popup auto-close time
// On startup, settle alarms left unresolved by a previous run/restart
settleStaleAlarms.run('-20 seconds');
setInterval(() => {
  try { settleStaleAlarms.run('-20 seconds'); } catch { /* ignore */ }
}, 10 * 1000).unref();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] } });

// PORT priority:
// 1. Environment / server.env (if explicitly set > 0)
// 2. Database setting 'server_port' saved via Admin UI (if set > 0)
// 3. 0 to let the OS pick any free port automatically.
let initialPort = parseInt(process.env.PORT || '0', 10);
if (!initialPort) {
  try {
    const r = getSetting.get('server_port');
    if (r && r.value) {
      const dbPort = parseInt(r.value, 10);
      if (dbPort && !isNaN(dbPort) && dbPort > 0) {
        initialPort = dbPort;
      }
    }
  } catch {}
}
const PORT = initialPort || 0;
const HOST = process.env.HOST || '0.0.0.0';

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve web admin panel static files
app.use('/admin', express.static(path.join(__dirname, 'public')));

// ── Health ─────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Public: list hospitals for client dropdown (no auth) ───────
app.get('/api/public/hospitals', (req, res) => {
  const rows = listClients.all();
  res.json(rows.map(r => ({
    id           : r.id,
    client_name  : r.client_name,
    hospital_code: r.hospital_code,
  })));
});

// ── Public: get dept/blocks by hospital code (for client setup dropdown) ───
app.get('/api/public/departments/:hospitalCode', (req, res) => {
  const code = req.params.hospitalCode.trim().toUpperCase();
  // Return only type='department' rows to the client setup screen
  const rows = listDeptBlocksByHospital.all(code);
  res.json(rows);
});

// ── Public: server IP info (for client installer) ─────────────
app.get('/api/public/server-info', (req, res) => {
  const ips = Object.values(os.networkInterfaces())
    .flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  const hospitalRow = listClients.all()[0]; // First hospital registered
  res.json({
    serverIp    : ips[0] || 'localhost',
    port        : PORT,
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
  const addr = req.socket.remoteAddress || '';
  if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') return next();
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

// GET /api/public/reset-request  → { requestCode }  (code the vendor needs for an admin password reset)
app.get('/api/public/reset-request', localOnly, (req, res) => {
  if (!license.isActivated()) return res.status(403).json({ error: 'Activate the server first', activationRequired: true });
  res.json({ requestCode: license.resetRequestCode() });
});

// POST /api/public/reset-admin-password  { code, newPassword }
app.post('/api/public/reset-admin-password', localOnly, (req, res) => {
  const { code, newPassword } = req.body || {};
  if (!license.isActivated()) return res.status(403).json({ error: 'Activate the server first', activationRequired: true });
  if (typeof code !== 'string' || code.length < 20 || code.length > 600)
    return res.status(400).json({ error: 'Paste the full Reset Code' });
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128 || newPassword === DEFAULT_ADMIN_PASSWORD)
    return res.status(400).json({ error: 'New password must be 8–128 characters and not the default password' });
  const r = license.checkReset(code);
  if (!r.ok) return sendCheckFailure(res, r);
  const admin = db.prepare('SELECT id FROM admin_users ORDER BY id LIMIT 1').get();
  if (!admin) return res.status(500).json({ error: 'No admin account found' });
  updateAdminPassword.run(bcrypt.hashSync(newPassword, 12), admin.id);
  license.consumeReset();
  console.log('[License] Admin password reset with vendor code');
  res.json({ message: 'Admin password reset. Sign in with the new password.' });
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
  if (!result) return res.status(401).json({ error: 'Invalid credentials' });
  res.json(result);
});

// POST /api/admin/change-password
app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string')
    return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 8 || newPassword.length > 128)
    return res.status(400).json({ error: 'New password must be 8–128 characters' });
  if (newPassword === DEFAULT_ADMIN_PASSWORD)
    return res.status(400).json({ error: 'Choose a password different from the default one' });
  const user = findAdmin.get(req.admin.username);
  if (!bcrypt.compareSync(currentPassword, user.password))
    return res.status(400).json({ error: 'Current password incorrect' });
  const hash = bcrypt.hashSync(newPassword, 12);
  updateAdminPassword.run(hash, user.id);
  res.json({ message: 'Password changed' });
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

// POST /api/admin/clients  { client_name, hospital_code, system_limit, email, email_logs, email_reports, location }
app.post('/api/admin/clients', requireAdmin, (req, res) => {
  const { client_name, hospital_code, system_limit = 100, email = null, email_logs = 0, email_reports = 0, location = null } = req.body || {};
  if (!client_name || !hospital_code)
    return res.status(400).json({ error: 'client_name and hospital_code required' });
  try {
    const r = createClient.run(
      client_name.trim(), hospital_code.trim().toUpperCase(), parseInt(system_limit),
      email || null, email_logs ? 1 : 0, email_reports ? 1 : 0, location || null
    );
    res.status(201).json({ id: r.lastInsertRowid, message: 'Client created' });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Hospital code already exists' });
    throw e;
  }
});

// PUT /api/admin/clients/:id
app.put('/api/admin/clients/:id', requireAdmin, (req, res) => {
  const { client_name, hospital_code, system_limit, email, email_logs, email_reports, location } = req.body || {};
  const c = findClientById.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Client not found' });
  updateClient.run(
    client_name  || c.client_name,
    (hospital_code || c.hospital_code).toUpperCase(),
    parseInt(system_limit || c.system_limit),
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
  if (!user_id || !user_id.trim())
    return res.status(400).json({ error: 'User ID is required' });
  if (!user_name)
    return res.status(400).json({ error: 'user_name required' });
  const existing = findClientUserByUserId.get(user_id.trim(), client.hospital_code);
  if (existing)
    return res.status(409).json({ error: `User ID "${user_id}" already exists in this hospital` });
  const normalizedRole = normalizeRole(role);
  const deviceId = 'admin-' + uuidv4();
  const token    = signClientToken({
    deviceId, hospital_code: client.hospital_code,
    user_id: user_id.trim(), room_number, system_number, user_name, role: normalizedRole,
  });
  createClientUserAdmin.run(
    client.id, client.hospital_code, user_id.trim(),
    room_number || '', system_number || '', user_name, normalizedRole,
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
      return res.status(409).json({ error: `User ID "${user_id}" already exists in this hospital` });
  }
  const normalizedRole = normalizeRole(role || u.role);
  updateClientUser.run(
    user_id       !== undefined ? user_id       : u.user_id,
    room_number   !== undefined ? room_number   : u.room_number,
    system_number !== undefined ? system_number : u.system_number,
    user_name     !== undefined ? (user_name || u.user_name) : u.user_name,
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
      return res.status(409).json({ error: 'Location already exists for this hospital' });
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
      return res.status(409).json({ error: 'Department already exists for this hospital' });
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

app.get('/api/admin/logs', requireAdmin, (req, res) => {
  const { from, to, hospital_code } = req.query;
  if (from && to) return res.json(listLogsByDate.all(from, to));
  if (hospital_code) return res.json(listLogsByHospital.all(hospital_code));
  res.json(listLogs.all());
});

app.delete('/api/admin/logs', requireAdmin, (req, res) => {
  const { ids, all } = req.body || {};
  if (all) {
    const info = deleteAllLogs.run();
    return res.json({ deleted: info.changes });
  }
  if (Array.isArray(ids) && ids.length > 0) {
    const del = db.transaction((list) => {
      let n = 0;
      for (const id of list) { const r = deleteLogById.run(String(id)); n += r.changes; }
      return n;
    });
    return res.json({ deleted: del(ids) });
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
app.get('/api/admin/network-info', requireAdmin, (req, res) => {
  const bound = server.address();
  const activePort = bound ? bound.port : (parseInt(process.env.PORT || '0', 10) || PORT);
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  const dbSetting = getSetting.get('server_port');
  const dbPort = dbSetting && dbSetting.value ? parseInt(dbSetting.value, 10) : null;

  res.json({
    activePort,
    activeHost: HOST,
    ips: ips.length > 0 ? ips : ['127.0.0.1'],
    primaryIp: ips[0] || 'localhost',
    configuredPort: dbPort !== null ? dbPort : (PORT !== 0 ? PORT : 0),
    isAutoPort: (dbPort === null || dbPort === 0) && PORT === 0,
    dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'panic_alarm.db'),
  });
});

// Helper to test if a port is currently available before saving
function testPortAvailability(portNum) {
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
      .listen(portNum, '0.0.0.0');
  });
}

// POST /api/admin/network-settings — update saved port setting with validation & live conflict test
app.post('/api/admin/network-settings', requireAdmin, async (req, res) => {
  const { port, autoPort } = req.body || {};
  if (autoPort) {
    setSetting.run('server_port', '0');
    return res.json({
      message: 'Network port set to auto-assign (0). Restart the server application for changes to take effect.',
      port: 0,
    });
  }

  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
    return res.status(400).json({ error: 'Port must be a valid number between 1024 and 65535 (or choose Auto-assign).' });
  }

  // If the chosen port is not the currently running port, test if it is free
  const bound = server.address();
  const activePort = bound ? bound.port : null;
  if (activePort && portNum !== activePort) {
    const check = await testPortAvailability(portNum);
    if (!check.available) {
      return res.status(400).json({ error: check.error });
    }
  }

  setSetting.run('server_port', String(portNum));
  return res.json({
    message: `Server port verified and saved as ${portNum}. Restart the server application for changes to take effect.`,
    port: portNum,
  });
});

// ══════════════════════════════════════════════════════════════
//  CLIENT API  (called from Electron desktop app)
// ══════════════════════════════════════════════════════════════

// POST /api/client/register  — called once at first-run wizard
app.post('/api/client/register', (req, res) => {
  const {
    hospital_code, user_id, room_number, system_number, user_name,
    role = 'staff', device_id, department = null,
  } = req.body || {};

  if (!hospital_code || !user_name || !device_id)
    return res.status(400).json({ error: 'Required: hospital_code, user_name, device_id' });
  if (!user_id || !user_id.trim())
    return res.status(400).json({ error: 'User ID is required' });

  const code   = hospital_code.trim().toUpperCase();
  const uid    = user_id.trim();
  const client = findClientByCode.get(code);
  if (!client) return res.status(404).json({ error: 'Hospital code not recognised. Contact your administrator.' });

  // Check system limit
  const { cnt } = countClientUsers.get(client.id);
  const existingDevice = findClientUser.get(device_id);

  if (!existingDevice) {
    const existingUid = findClientUserByUserId.get(uid, code);
    if (existingUid)
      return res.status(409).json({ error: `User ID "${uid}" is already registered in this hospital. Use a unique ID.` });
  }

  if (!existingDevice && cnt >= client.system_limit)
    return res.status(403).json({ error: `System limit reached (${client.system_limit}). Contact administrator.` });

  const normalizedRole = normalizeRole(role);
  const token = signClientToken({
    deviceId: device_id, hospital_code: code, user_id: uid,
    room_number, system_number, user_name, role: normalizedRole,
  });

  if (existingDevice) {
    updateClientUser.run(uid, room_number, system_number, user_name, normalizedRole,
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

  createClientUser.run(client.id, code, uid, room_number || '', system_number || '', user_name, normalizedRole, 'client', device_id, token, department || null);
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
  const { user_id, room_number, system_number, user_name, role, department } = req.body || {};

  const newUserId = (user_id || u.user_id || '').trim();
  if (newUserId && newUserId !== u.user_id) {
    const existingUid = findClientUserByUserId.get(newUserId, u.hospital_code);
    if (existingUid && existingUid.id !== u.id)
      return res.status(409).json({ error: `User ID "${newUserId}" is already taken in this hospital` });
  }

  const normalizedRole = normalizeRole(role || u.role);
  updateClientUser.run(
    newUserId,
    room_number   !== undefined ? room_number   : u.room_number,
    system_number !== undefined ? system_number : u.system_number,
    user_name     !== undefined ? (user_name || u.user_name) : u.user_name,
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

// POST /api/client/alarm/trigger
const lastAlarmByDevice = new Map();   // deviceId -> timestamp of last accepted alarm
const ALARM_LOCK_MS = 20 * 1000;

app.post('/api/client/alarm/trigger', requireClient, (req, res) => {
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
  const message  = `🚨 PANIC ALARM — ${u.user_name}${userId ? ' (ID: ' + userId + ')' : ''} in Room ${u.room_number} needs IMMEDIATE HELP!`;
  const severity = 'PANIC';

  insertLog.run(alarmId, u.hospital_code, u.user_name, userId, u.room_number, u.system_number, u.deviceId, severity, message);

  const hCode = (u.hospital_code || '').toString().trim().toUpperCase();
  const roomName = `hospital_${hCode}`;

  // Broadcast to all OTHER clients in the same hospital — exclude the triggering socket
  const triggeringSocket = [...io.sockets.sockets.values()]
    .find(s => s.data && s.data.deviceId === u.deviceId);

  const alarmPayload = {
    alarmId,
    hospitalCode : hCode,
    triggeredBy  : u.user_name,
    userId       : userId,
    roomNumber   : u.room_number,
    systemNumber : u.system_number,
    deviceId     : u.deviceId,
    severity,
    message,
    triggeredAt  : new Date().toISOString(),
  };

  if (triggeringSocket) {
    // Broadcast to everyone in the room EXCEPT the triggering socket
    triggeringSocket.to(roomName).emit('panic_alarm', alarmPayload);
  } else {
    // Fallback: broadcast to all (triggering socket not found)
    io.to(roomName).emit('panic_alarm', alarmPayload);
  }
  // Also push to admin panel room
  io.to('admin').emit('panic_alarm', alarmPayload);

  // Popup auto-closes after 20 s. If no OK / No-Response arrives by then
  // (e.g. nobody online, popup crashed) settle the alarm so it never stays "Active".
  setTimeout(() => {
    try { markNoResponse.run(alarmId); } catch (e) { console.error('[ALARM] settle failed', e.message); }
  }, ALARM_SETTLE_MS);

  console.log(`[ALARM] ${new Date().toISOString()} | ${hCode} | ${u.user_name} (${userId}) | Room ${u.room_number}`);
  res.json({ alarmId, message: 'Alarm sent' });
});

// POST /api/client/alarm/acknowledge
app.post('/api/client/alarm/acknowledge', requireClient, (req, res) => {
  const { alarmId } = req.body || {};
  if (!alarmId) return res.status(400).json({ error: 'alarmId required' });
  const u = req.clientUser;
  const hCode = (u.hospital_code || '').toString().trim().toUpperCase();
  acknowledgeAlarm.run(u.user_name, alarmId);
  io.to(`hospital_${hCode}`).emit('alarm_acknowledged', {
    alarmId, ackBy: u.user_name, ackAt: new Date().toISOString(),
  });
  io.to('admin').emit('alarm_acknowledged', {
    alarmId, ackBy: u.user_name, ackAt: new Date().toISOString(),
  });
  res.json({ message: 'Acknowledged' });
});

// POST /api/client/alarm/no-response  — called when alert auto-closes without OK
app.post('/api/client/alarm/no-response', requireClient, (req, res) => {
  const { alarmId } = req.body || {};
  if (!alarmId) return res.status(400).json({ error: 'alarmId required' });
  const u = req.clientUser;
  markNoResponse.run(alarmId);
  console.log(`[NO-RESPONSE] ${new Date().toISOString()} | Alarm ${alarmId} | Device ${u.deviceId || u.user_name}`);
  res.json({ message: 'No-response recorded' });
});

// ── Socket.IO ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Connected: ${socket.id}`);

  socket.on('join', (data) => {
    const code = (data && (data.hospitalCode || data.hospital_code || ''))
      .toString().trim().toUpperCase();
    // Store deviceId on socket for alarm exclusion
    if (data && data.deviceId) socket.data.deviceId = data.deviceId;
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
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Disconnected: ${socket.id}`);
  });
});

// ── Error handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────
// Passing PORT=0 tells the OS to assign the next available free port automatically.
server.listen(PORT, HOST, () => {
  const bound = server.address();
  const actualPort = bound ? bound.port : PORT;
  // Write the actual port back to the environment so other modules can read it.
  process.env.PORT = String(actualPort);

  const ips = Object.values(os.networkInterfaces())
    .flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🚨  PANIC ALARM SERVER — RUNNING  🚨           ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Port        : ${actualPort}${PORT === 0 ? '  (auto-assigned)' : ''}`);
  console.log(`║  Intranet IP : ${ips.join(' | ') || 'N/A'}`);
  console.log(`║  Admin Panel : http://${ips[0] || 'localhost'}:${actualPort}/admin/`);
  console.log('║  DB          : SQLite ./data/panic_alarm.db');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});

process.on('SIGINT',  () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });

// Export the http server so server-main.js can read the actual bound port.
module.exports = { server };

// ── Helpers ────────────────────────────────────────────────────
function normalizeRole(role) {
  if (!role) return 'staff';
  const r = role.toString().toLowerCase().trim();
  if (r === 'doctor') return 'doctor';
  if (r === 'other')  return 'other';
  return 'staff';
}
