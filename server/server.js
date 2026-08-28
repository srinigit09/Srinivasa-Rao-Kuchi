'use strict';

require('dotenv').config();

const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const cors        = require('cors');
const bcrypt      = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const os          = require('os');
const path        = require('path');
const crypto      = require('crypto');
const cookieParser = require('cookie-parser');

const { requireAdmin, requireClient, adminLogin, signClientToken, signAdminToken } = require('./auth');
const {
  db,
  findAdmin, listAdmins, updateAdminPassword,
  listClients, findClientByCode, findClientById, createClient, updateClient, deleteClient, countClientUsers, setClientLocation,
  listClientUsers, findClientUser, findClientUserById, findClientUserByUserId,
  createClientUser, createClientUserAdmin, updateClientUser,
  updateClientUserToken, deleteClientUser,
  insertLog, acknowledgeAlarm, markNoResponse, listLogs, listLogsByHospital, listLogsByDate,
  deleteLogById, deleteAllLogs,
  getSetting, setSetting,
  listLocations, listLocationsByHospital,
  listDeptBlocks, listDeptBlocksByHospital,
  listDepartments, listDepartmentsByHospital, findDepartmentById, createDepartment, updateDepartment, deleteDepartment,
} = require('./db');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] } });

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Encryption helpers (AES-256-GCM) for installation key storage ──────────
const ENC_SECRET = process.env.ENC_SECRET || 'panic-alarm-enc-key-2026-default';

function encryptValue(plaintext) {
  const key = crypto.scryptSync(ENC_SECRET, 'pa-salt-2026', 32);
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decryptValue(stored) {
  try {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const key = crypto.scryptSync(ENC_SECRET, 'pa-salt-2026', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch { return null; }
}

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
try {
  app.use(cookieParser());
} catch { /* cookie-parser optional */ }

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

// ── Installation key verification ─────────────────────────────
// POST /api/public/verify-key
app.post('/api/public/verify-key', (req, res) => {
  const { key } = req.body || {};
  const stored = getSetting.get('install_key');
  if (!stored) {
    // First-time: store the key encrypted
    if (key !== 'panicalarm@09')
      return res.status(401).json({ error: 'Invalid installation key' });
    setSetting.run('install_key', encryptValue(key));
    return res.json({ ok: true });
  }
  // Verify against stored encrypted key
  const decrypted = decryptValue(stored.value);
  if (!decrypted || decrypted !== key)
    return res.status(401).json({ error: 'Invalid installation key' });
  res.json({ ok: true });
});

// ── OTP for key reset ─────────────────────────────────────────
const otpStore = new Map(); // alarmId → { otp, expiresAt }

// POST /api/admin/request-key-reset  (no auth required — used before login)
app.post('/api/admin/request-key-reset', async (req, res) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  otpStore.set('key-reset', { otp, expiresAt });

  // Send OTP via nodemailer if available, otherwise just log it
  try {
    const nodemailer = require('nodemailer');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

    if (smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from   : smtpUser,
        to     : 'srinivasa.kuchi@gmail.com',
        subject: 'Panic Alarm Server — Key Reset OTP',
        text   : `Your OTP for Panic Alarm Server key reset is: ${otp}\n\nThis code expires in 10 minutes.`,
      });
      res.json({ message: 'OTP sent to administrator email' });
    } else {
      // SMTP not configured — log OTP to server console only
      console.log(`[KEY-RESET] OTP: ${otp} (expires in 10 min) — configure SMTP_USER/SMTP_PASS to email this`);
      res.json({ message: 'OTP generated (check server console — SMTP not configured)' });
    }
  } catch (e) {
    console.error('[KEY-RESET] Email error:', e.message);
    console.log(`[KEY-RESET] OTP: ${otp}`);
    res.json({ message: 'OTP generated (check server console)' });
  }
});

// POST /api/admin/reset-key  { otp, newKey }
app.post('/api/admin/reset-key', (req, res) => {
  const { otp, newKey } = req.body || {};
  const entry = otpStore.get('key-reset');
  if (!entry || entry.otp !== otp || Date.now() > entry.expiresAt) {
    return res.status(401).json({ error: 'Invalid or expired OTP' });
  }
  if (!newKey || newKey.trim().length < 6) {
    return res.status(400).json({ error: 'New key must be at least 6 characters' });
  }
  otpStore.delete('key-reset');
  setSetting.run('install_key', encryptValue(newKey.trim()));
  res.json({ message: 'Installation key updated successfully' });
});

// ══════════════════════════════════════════════════════════════
//  ADMIN WEB PANEL ROUTES  (served to browser, protected by JWT)
// ══════════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  const token = adminLogin(username, password);
  if (!token) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token });
});

// POST /api/admin/change-password
app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
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

// GET /api/admin/clients/:id/users
app.get('/api/admin/clients/:id/users', requireAdmin, (req, res) => {
  res.json(listClientUsers.all(req.params.id));
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
    room_number   || u.room_number,
    system_number || u.system_number,
    user_name     || u.user_name,
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

// Serve client installer for browser download (when not in Electron desktop)
app.get('/api/admin/client-installer-path', requireAdmin, (req, res) => {
  const fs = require('fs');
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  const candidates = [
    'PanicAlarmClient Setup 1.1.0.exe',
    'PanicAlarmClient-1.1.0-arm64.dmg',
    'PanicAlarmClient-1.1.0.dmg',
  ];
  for (const name of candidates) {
    const full = path.join(clientDist, name);
    if (fs.existsSync(full)) {
      // Serve via a static route — mount on demand
      return res.json({ url: `/client-installer/${encodeURIComponent(name)}`, filename: name });
    }
  }
  res.json({ error: 'No client installer found. Run build-win or build-mac-arm in the client folder first.' });
});

// Serve the installer file itself
app.get('/client-installer/:filename', requireAdmin, (req, res) => {
  const fs = require('fs');
  const name = decodeURIComponent(req.params.filename);
  // Whitelist only expected filenames to prevent path traversal
  if (!/^PanicAlarmClient[-\s][^/\\]+\.(exe|dmg)$/.test(name))
    return res.status(400).json({ error: 'Invalid filename' });
  const full = path.join(__dirname, '..', 'client', 'dist', name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
  res.download(full, name);
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
    newUserId     || u.user_id,
    room_number   || u.room_number,
    system_number || u.system_number,
    user_name     || u.user_name,
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
app.post('/api/client/alarm/trigger', requireClient, (req, res) => {
  const u = req.clientUser;
  const role = normalizeRole(u.role);
  if (role !== 'doctor')
    return res.status(403).json({ error: 'Only doctors can trigger alarms' });

  const alarmId  = uuidv4();
  const userId   = u.user_id || u.userId || '';
  const message  = `🚨 PANIC ALARM — ${u.user_name}${userId ? ' (ID: ' + userId + ')' : ''} in Room ${u.room_number} needs IMMEDIATE HELP!`;
  const severity = 'PANIC';

  insertLog.run(alarmId, u.hospital_code, u.user_name, userId, u.room_number, u.system_number, u.deviceId, severity, message);

  // Broadcast to all OTHER clients in the same hospital — exclude the triggering socket
  const triggeringSocket = [...io.sockets.sockets.values()]
    .find(s => s.data && s.data.deviceId === u.deviceId);

  const alarmPayload = {
    alarmId,
    hospitalCode : u.hospital_code,
    triggeredBy  : u.user_name,
    userId       : userId,
    roomNumber   : u.room_number,
    systemNumber : u.system_number,
    severity,
    message,
    triggeredAt  : new Date().toISOString(),
  };

  if (triggeringSocket) {
    // Broadcast to everyone in the room EXCEPT the triggering socket
    triggeringSocket.to(`hospital_${u.hospital_code}`).emit('panic_alarm', alarmPayload);
  } else {
    // Fallback: broadcast to all (triggering socket not found)
    io.to(`hospital_${u.hospital_code}`).emit('panic_alarm', alarmPayload);
  }

  console.log(`[ALARM] ${new Date().toISOString()} | ${u.hospital_code} | ${u.user_name} (${userId}) | Room ${u.room_number}`);
  res.json({ alarmId, message: 'Alarm sent' });
});

// POST /api/client/alarm/acknowledge
app.post('/api/client/alarm/acknowledge', requireClient, (req, res) => {
  const { alarmId } = req.body || {};
  if (!alarmId) return res.status(400).json({ error: 'alarmId required' });
  const u = req.clientUser;
  acknowledgeAlarm.run(u.user_name, alarmId);
  io.to(`hospital_${u.hospital_code}`).emit('alarm_acknowledged', {
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
server.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces())
    .flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🚨  PANIC ALARM SERVER — RUNNING  🚨           ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Port        : ${PORT}`);
  console.log(`║  Intranet IP : ${ips.join(' | ') || 'N/A'}`);
  console.log(`║  Admin Panel : http://${ips[0] || 'localhost'}:${PORT}/admin/`);
  console.log('║  DB          : SQLite ./data/panic_alarm.db');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});

process.on('SIGINT',  () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });

// ── Helpers ────────────────────────────────────────────────────
function normalizeRole(role) {
  if (!role) return 'staff';
  const r = role.toString().toLowerCase().trim();
  if (r === 'doctor') return 'doctor';
  if (r === 'other')  return 'other';
  return 'staff';
}
