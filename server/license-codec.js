'use strict';

/**
 * License code format shared by the server (verify) and the Key Issuer app (sign).
 * IMPORTANT: key-issuer/license-codec.js must be a byte-identical copy of this file
 * (key-issuer/test/issuer.test.js fails if they differ).
 *
 * Request Code    (server -> vendor)   : machineId(10) + nonce(4) + checksum(1), base32, 6 groups of 4
 * Activation Code (vendor -> server)   : payload + Ed25519 signature(64), base32, groups of 5
 *
 * payload = version(1) keyId(1) purpose(1) machineId(10) nonce(4) expiryDay(2, BE) nameLen(1) name(0..40)
 * expiryDay = days since 1970-01-01 (UTC), last valid day; 0 = permanent.
 */

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const VERSION = 1;
const PURPOSE = { ACTIVATE: 1, RESET: 2 };
const MACHINE_LEN = 10;
const NONCE_LEN = 4;
const SIG_LEN = 64;
const MAX_NAME = 40;
const HEADER_LEN = 3 + MACHINE_LEN + NONCE_LEN + 2 + 1; // up to and including nameLen
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex'); // Ed25519 SubjectPublicKeyInfo

function b32encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function clean(text) {
  return String(text == null ? '' : text).toUpperCase().replace(/[^A-Z2-7]/g, '');
}

function group(str, size) {
  return str.match(new RegExp(`.{1,${size}}`, 'g')).join('-');
}

function checksum(buf) {
  return crypto.createHash('sha256').update(buf).digest()[0];
}

// ── Request Code ──────────────────────────────────────────────
function encodeRequest(machineId, nonce) {
  if (machineId.length !== MACHINE_LEN || nonce.length !== NONCE_LEN) throw new Error('bad request fields');
  const body = Buffer.concat([machineId, nonce]);
  return group(b32encode(Buffer.concat([body, Buffer.from([checksum(body)])])), 4);
}

function decodeRequest(text) {
  const buf = b32decode(clean(text));
  if (!buf || buf.length !== MACHINE_LEN + NONCE_LEN + 1) return null;
  const body = buf.subarray(0, MACHINE_LEN + NONCE_LEN);
  if (buf[buf.length - 1] !== checksum(body)) return null;
  return { machineId: Buffer.from(body.subarray(0, MACHINE_LEN)), nonce: Buffer.from(body.subarray(MACHINE_LEN)) };
}

// ── Activation / Reset Code ───────────────────────────────────
function buildPayload({ keyId, purpose, machineId, nonce, expiryDay = 0, name = '' }) {
  const nameBuf = Buffer.from(String(name), 'utf8');
  if (nameBuf.length > MAX_NAME) throw new Error('name too long');
  if (!Number.isInteger(keyId) || keyId < 1 || keyId > 255) throw new Error('bad keyId');
  if (!Number.isInteger(expiryDay) || expiryDay < 0 || expiryDay > 65535) throw new Error('bad expiry');
  if (machineId.length !== MACHINE_LEN || nonce.length !== NONCE_LEN) throw new Error('bad request fields');
  const exp = Buffer.alloc(2);
  exp.writeUInt16BE(expiryDay);
  return Buffer.concat([
    Buffer.from([VERSION, keyId, purpose]), machineId, nonce, exp, Buffer.from([nameBuf.length]), nameBuf,
  ]);
}

function parsePayload(payload) {
  if (payload.length < HEADER_LEN) return null;
  const nameLen = payload[HEADER_LEN - 1];
  if (nameLen > MAX_NAME || payload.length !== HEADER_LEN + nameLen) return null;
  return {
    version: payload[0],
    keyId: payload[1],
    purpose: payload[2],
    machineId: payload.subarray(3, 3 + MACHINE_LEN),
    nonce: payload.subarray(3 + MACHINE_LEN, 3 + MACHINE_LEN + NONCE_LEN),
    expiryDay: payload.readUInt16BE(3 + MACHINE_LEN + NONCE_LEN),
    name: payload.subarray(HEADER_LEN).toString('utf8'),
  };
}

// Used by the Key Issuer only. privateKey is a crypto KeyObject (Ed25519).
function issueCode(privateKey, fields) {
  const payload = buildPayload(fields);
  const signature = crypto.sign(null, payload, privateKey);
  return group(b32encode(Buffer.concat([payload, signature])), 5);
}

function publicKeyObject(hex) {
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });
}

function publicKeyHex(publicKey) {
  return publicKey.export({ format: 'der', type: 'spki' }).subarray(SPKI_PREFIX.length).toString('hex');
}

/**
 * Verify a code. publicKeys = [{ id, publicKey: <64 hex>, retired }].
 * expect = { purpose, machineId, nonce?, nowDay }  (nonce omitted => not checked)
 * Returns { ok:true, info } or { ok:false, reason } where reason is one of:
 * format | unknown_key | retired_key | signature | purpose | mismatch | expired
 */
function verifyCode(text, publicKeys, expect) {
  const buf = b32decode(clean(text));
  if (!buf || buf.length < HEADER_LEN + SIG_LEN) return { ok: false, reason: 'format' };
  const payload = buf.subarray(0, buf.length - SIG_LEN);
  const signature = buf.subarray(buf.length - SIG_LEN);
  const f = parsePayload(payload);
  if (!f || f.version !== VERSION) return { ok: false, reason: 'format' };

  const key = publicKeys.find(k => k.id === f.keyId);
  if (!key) return { ok: false, reason: 'unknown_key' };
  if (key.retired) return { ok: false, reason: 'retired_key' };

  let valid = false;
  try { valid = crypto.verify(null, payload, publicKeyObject(key.publicKey), signature); } catch { valid = false; }
  if (!valid) return { ok: false, reason: 'signature' };

  if (f.purpose !== expect.purpose) return { ok: false, reason: 'purpose' };
  if (!crypto.timingSafeEqual(f.machineId, expect.machineId)) return { ok: false, reason: 'mismatch' };
  if (expect.nonce && !crypto.timingSafeEqual(f.nonce, expect.nonce)) return { ok: false, reason: 'mismatch' };
  if (f.expiryDay !== 0 && expect.nowDay > f.expiryDay) return { ok: false, reason: 'expired' };

  return { ok: true, info: { keyId: f.keyId, purpose: f.purpose, name: f.name, expiryDay: f.expiryDay, nonce: Buffer.from(f.nonce) } };
}

module.exports = {
  PURPOSE, MACHINE_LEN, NONCE_LEN, MAX_NAME,
  encodeRequest, decodeRequest, issueCode, verifyCode, publicKeyHex,
};
