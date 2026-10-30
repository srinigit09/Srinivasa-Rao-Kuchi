'use strict';

/**
 * Offline license handling for the server.
 *
 * - The server only holds PUBLIC keys (license-keys.js), so it can verify codes but never create them.
 * - A code is bound to this computer (machine id) and, when first used, to a one-time nonce taken
 *   from the Request Code that the server showed.
 * - The accepted Activation Code is stored and re-verified on every status check, so editing the
 *   database cannot activate the server and an expired license locks it again.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const codec = require('./license-codec');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const DAY_MS = 86400000;

const MESSAGES = {
  format: [400, 'That is not a valid code. Make sure the whole code was pasted.'],
  unknown_key: [401, 'Invalid code.'],
  retired_key: [401, 'This code was signed with a retired key. Ask the vendor for a new code.'],
  signature: [401, 'Invalid code.'],
  purpose: [401, 'This code is for a different purpose.'],
  mismatch: [401, 'This code was issued for a different computer or for an older Request Code. Send the current Request Code to the vendor.'],
  expired: [401, 'This license has expired. Ask the vendor for a new Activation Code.'],
};

function readMachineGuid() {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 5000 });
      const m = out.match(/"IOPlatformUUID" = "([^"]+)"/);
      return m ? m[1] : null;
    }
    if (process.platform === 'win32') {
      const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
      const out = execFileSync(reg, ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', timeout: 5000, windowsHide: true });
      const m = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      return m ? m[1] : null;
    }
    for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try { const v = fs.readFileSync(p, 'utf8').trim(); if (v) return v; } catch { /* try next */ }
    }
  } catch { /* fall through to null */ }
  return null;
}

/**
 * store: { get(key) -> string|null, set(key, value) }
 * publicKeys: [{ id, publicKey: '<64 hex>', retired }]
 */
function createLicense({ store, publicKeys, now = Date.now, readGuid = readMachineGuid }) {
  let cachedMachineId = null;
  const buckets = { activate: { n: 0, until: 0 }, reset: { n: 0, until: 0 } };

  function machineId() {
    if (cachedMachineId) return cachedMachineId;
    let guid = readGuid();
    if (!guid) {
      // Rare: no OS identifier available. Use a random id kept in the database instead.
      guid = store.get('machine_fallback_id');
      if (!guid) { guid = crypto.randomBytes(16).toString('hex'); store.set('machine_fallback_id', guid); }
    }
    cachedMachineId = crypto.createHash('sha256').update('panic-alarm-machine:' + guid).digest().subarray(0, codec.MACHINE_LEN);
    return cachedMachineId;
  }

  function nonce(name) {
    let hex = store.get(name);
    if (!hex || !/^[0-9a-f]{8}$/.test(hex)) { hex = crypto.randomBytes(codec.NONCE_LEN).toString('hex'); store.set(name, hex); }
    return Buffer.from(hex, 'hex');
  }
  function rotate(name) { store.set(name, crypto.randomBytes(codec.NONCE_LEN).toString('hex')); }

  const nowDay = () => Math.floor(now() / DAY_MS);
  const activeKeys = () => publicKeys.filter(k => !k.retired);
  const keysConfigured = () => activeKeys().length > 0;

  function dayToDate(day) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }

  function getStatus() {
    const base = {
      keysConfigured: keysConfigured(),
      requestCode: codec.encodeRequest(machineId(), nonce('license_nonce')),
    };
    const code = store.get('license_code');
    if (!code) return { ...base, activated: false, reason: 'none' };
    const r = codec.verifyCode(code, publicKeys, { purpose: codec.PURPOSE.ACTIVATE, machineId: machineId(), nowDay: nowDay() });
    if (!r.ok) return { ...base, activated: false, reason: r.reason };
    return {
      ...base, activated: true, licensee: r.info.name,
      expiresOn: r.info.expiryDay === 0 ? null : dayToDate(r.info.expiryDay),
    };
  }

  function isActivated() { return getStatus().activated; }

  function lockedFor(bucket) {
    const b = buckets[bucket];
    if (b.until && b.until <= now()) { b.n = 0; b.until = 0; }
    return b.until ? Math.ceil((b.until - now()) / 1000) : 0;
  }
  function recordFailure(bucket) {
    const b = buckets[bucket];
    b.n += 1;
    if (b.n >= MAX_FAILS) b.until = now() + LOCK_MS;
  }

  // Shared by activate() and checkReset(): returns { ok:true, info } or { ok:false, status, error, retryAfterSec? }
  function check(bucket, text, purpose, nonceName) {
    const wait = lockedFor(bucket);
    if (wait) return { ok: false, status: 429, error: 'Too many wrong codes. Try again later.', retryAfterSec: wait };
    if (!keysConfigured()) {
      return { ok: false, status: 503, error: 'This build has no vendor license keys configured. Contact the vendor.' };
    }
    const r = codec.verifyCode(text, publicKeys, { purpose, machineId: machineId(), nonce: nonce(nonceName), nowDay: nowDay() });
    if (!r.ok) {
      recordFailure(bucket);
      const [status, error] = MESSAGES[r.reason] || MESSAGES.signature;
      return { ok: false, status, error };
    }
    buckets[bucket].n = 0;
    return { ok: true, info: r.info };
  }

  function activate(text) {
    const r = check('activate', text, codec.PURPOSE.ACTIVATE, 'license_nonce');
    if (!r.ok) return r;
    store.set('license_code', String(text).toUpperCase().replace(/[^A-Z2-7]/g, ''));
    rotate('license_nonce');
    return { ok: true, status: getStatus() };
  }

  function resetRequestCode() {
    return codec.encodeRequest(machineId(), nonce('reset_nonce'));
  }

  // Verifies a vendor Reset Code. The caller applies the password change, then calls consumeReset().
  function checkReset(text) { return check('reset', text, codec.PURPOSE.RESET, 'reset_nonce'); }
  function consumeReset() { rotate('reset_nonce'); }

  return { getStatus, isActivated, activate, resetRequestCode, checkReset, consumeReset, machineId };
}

module.exports = { createLicense, MAX_FAILS, LOCK_MS };
