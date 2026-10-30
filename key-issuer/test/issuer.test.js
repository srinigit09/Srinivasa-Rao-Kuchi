'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const vaultLib = require('../vault');
const { createLicense, MAX_FAILS, LOCK_MS } = require('../../server/license');
const codec = require('../license-codec');

const PASS = 'correct horse battery';
const DAY = 86400000;

function memoryStore() {
  const m = new Map();
  return { get: k => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), m };
}

function setup({ guid = 'GUID-A', clock = { t: Date.UTC(2026, 5, 1) } } = {}) {
  const vault = vaultLib.createVault(PASS);
  const publicKeys = vault.keys.map(k => ({ id: k.id, publicKey: k.publicKey, retired: false }));
  const store = memoryStore();
  const lic = createLicense({ store, publicKeys, now: () => clock.t, readGuid: () => guid });
  return { vault, publicKeys, store, lic, clock };
}

test('codec files in server/ and key-issuer/ are identical', () => {
  const a = fs.readFileSync(path.join(__dirname, '../license-codec.js'));
  const b = fs.readFileSync(path.join(__dirname, '../../server/license-codec.js'));
  assert.ok(a.equals(b));
});

test('vault: 3 keys, private keys encrypted, wrong passphrase rejected', () => {
  const { vault } = setup();
  assert.strictEqual(vault.keys.length, 3);
  assert.throws(() => vaultLib.createVault('short'), /at least/);
  const json = JSON.stringify(vault);
  assert.ok(!json.includes('PRIVATE'));
  assert.throws(() => vaultLib.issue(vault, 'wrong passphrase!!', {
    purpose: 'activate', requestCode: setup().lic.getStatus().requestCode, customer: 'X',
  }), /Wrong passphrase/);
});

test('activation: issued code activates this machine, permanent', () => {
  const { vault, lic } = setup();
  const st = lic.getStatus();
  assert.strictEqual(st.activated, false);
  const code = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: st.requestCode, customer: 'City Hospital' });
  const r = lic.activate(code);
  assert.ok(r.ok);
  assert.strictEqual(lic.isActivated(), true);
  assert.strictEqual(lic.getStatus().licensee, 'City Hospital');
  assert.strictEqual(lic.getStatus().expiresOn, null);
});

test('activation: accepts the code with spaces/lowercase and hyphens removed or added', () => {
  const { vault, lic } = setup();
  const code = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A' });
  const messy = code.toLowerCase().replace(/-/g, ' \n');
  assert.ok(lic.activate(messy).ok);
});

test('activation: rejects invented, edited and truncated codes', () => {
  const { vault, lic } = setup();
  const code = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A' });
  assert.strictEqual(lic.activate('ABCD12345').ok, false);
  const flat = code.replace(/-/g, '');
  const i = 30;
  const flipped = flat.slice(0, i) + (flat[i] === 'A' ? 'B' : 'A') + flat.slice(i + 1);
  assert.strictEqual(lic.activate(flipped).ok, false);
  assert.strictEqual(lic.activate(flat.slice(0, -5)).ok, false);
  assert.strictEqual(lic.isActivated(), false);
});

test('activation: code for another computer is rejected', () => {
  const a = setup({ guid: 'GUID-A' });
  const codeForA = vaultLib.issue(a.vault, PASS, { purpose: 'activate', requestCode: a.lic.getStatus().requestCode, customer: 'A' });
  const b = createLicense({ store: memoryStore(), publicKeys: a.publicKeys, now: () => a.clock.t, readGuid: () => 'GUID-B' });
  const r = b.activate(codeForA);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 401);
});

test('activation: same code cannot be reused after activation (nonce rotates)', () => {
  const { vault, lic, store } = setup();
  const code = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A' });
  assert.ok(lic.activate(code).ok);
  // wipe the stored license (e.g. customer reinstalls): old code no longer matches the new Request Code
  store.m.delete('license_code');
  assert.strictEqual(lic.activate(code).ok, false);
  const fresh = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A' });
  assert.ok(lic.activate(fresh).ok);
});

test('expiry: license works until its last day, then the server locks again', () => {
  const clock = { t: Date.UTC(2026, 5, 1) };
  const { vault, lic } = setup({ clock });
  const code = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A', expiry: '2099-06-10' });
  // move clock close to that date for the test
  clock.t = Date.UTC(2099, 5, 9);
  assert.ok(lic.activate(code).ok);
  assert.strictEqual(lic.getStatus().expiresOn, '2099-06-10');
  clock.t = Date.UTC(2099, 5, 10, 23, 59);
  assert.strictEqual(lic.isActivated(), true);
  clock.t = Date.UTC(2099, 5, 11);
  assert.strictEqual(lic.isActivated(), false);
  assert.strictEqual(lic.getStatus().reason, 'expired');
});

test('expiry: past or malformed dates are refused by the issuer', () => {
  const { vault, lic } = setup();
  const rc = lic.getStatus().requestCode;
  assert.throws(() => vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: rc, customer: 'A', expiry: '2020-01-01' }), /future/);
  assert.throws(() => vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: rc, customer: 'A', expiry: 'tomorrow' }), /date/);
});

test('editing the database cannot activate the server', () => {
  const { lic, store } = setup();
  store.set('license_code', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  assert.strictEqual(lic.isActivated(), false);
  store.set('install_activated', '1');
  assert.strictEqual(lic.isActivated(), false);
});

test('attempt limit: locks after repeated wrong codes, then recovers', () => {
  const { vault, lic, clock } = setup();
  for (let i = 0; i < MAX_FAILS; i++) assert.strictEqual(lic.activate('NOTACODE'.repeat(5)).status, 400);
  const locked = lic.activate('NOTACODE'.repeat(5));
  assert.strictEqual(locked.status, 429);
  // even a correct code is refused while locked
  const code = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A' });
  assert.strictEqual(lic.activate(code).status, 429);
  clock.t += LOCK_MS + 1000;
  assert.ok(lic.activate(code).ok);
});

test('key rotation: key 2 works without any server change; retired key 1 is refused', () => {
  const { vault, publicKeys, lic } = setup();
  const rc = lic.getStatus().requestCode;
  vaultLib.setActiveKey(vault, 2);
  const code2 = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: rc, customer: 'A' });
  assert.ok(lic.activate(code2).ok);

  const s2 = setup();
  const lic2 = createLicense({
    store: memoryStore(), now: () => s2.clock.t, readGuid: () => 'GUID-A',
    publicKeys: s2.publicKeys.map(k => (k.id === 1 ? { ...k, retired: true } : k)),
  });
  const code1 = vaultLib.issue(s2.vault, PASS, { purpose: 'activate', requestCode: lic2.getStatus().requestCode, customer: 'A' });
  const r = lic2.activate(code1);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /retired/);
});

test('a code signed by a different vault (other private key) is refused', () => {
  const { lic } = setup();
  const other = vaultLib.createVault(PASS);
  const code = vaultLib.issue(other, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A' });
  assert.strictEqual(lic.activate(code).ok, false);
});

test('no public keys configured: nothing can be activated', () => {
  const lic = createLicense({ store: memoryStore(), publicKeys: [], readGuid: () => 'G' });
  assert.strictEqual(lic.getStatus().keysConfigured, false);
  assert.strictEqual(lic.activate('A'.repeat(100)).status, 503);
});

test('reset: Reset Code works once; Activation Code cannot be used as Reset Code', () => {
  const { vault, lic } = setup();
  const act = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A' });
  assert.ok(lic.activate(act).ok);

  const rq = lic.resetRequestCode();
  const reset = vaultLib.issue(vault, PASS, { purpose: 'reset', requestCode: rq });
  assert.strictEqual(lic.checkReset(act).ok, false);          // wrong purpose / nonce
  const ok = lic.checkReset(reset);
  assert.ok(ok.ok);
  lic.consumeReset();
  assert.strictEqual(lic.checkReset(reset).ok, false);        // single use
});

test('reset: a Reset Code is not accepted as an Activation Code', () => {
  const { vault, lic } = setup();
  const reset = vaultLib.issue(vault, PASS, { purpose: 'reset', requestCode: lic.getStatus().requestCode });
  assert.strictEqual(lic.activate(reset).ok, false);
});

test('request code: checksum catches typos; works with spaces and lowercase', () => {
  const { lic } = setup();
  const rc = lic.getStatus().requestCode;
  assert.ok(codec.decodeRequest(rc.toLowerCase().replace(/-/g, ' ')));
  const flat = rc.replace(/-/g, '');
  const bad = (flat[0] === 'A' ? 'B' : 'A') + flat.slice(1);
  assert.strictEqual(codec.decodeRequest(bad), null);
  assert.throws(() => vaultLib.issue(setup().vault, PASS, { purpose: 'activate', requestCode: bad, customer: 'A' }), /not valid/);
});

test('exports: license-keys.js contains the 3 public keys only; backup/restore of a spare key', () => {
  const { vault, publicKeys } = setup();
  const js = vaultLib.exportLicenseKeysJs(vault);
  for (const k of publicKeys) assert.ok(js.includes(k.publicKey));
  assert.ok(!/private|salt|iv|tag/.test(js));

  const backup = vaultLib.exportKeyBackup(vault, 3);
  vaultLib.removePrivate(vault, 3);
  assert.throws(() => vaultLib.setActiveKey(vault, 3), /no private key/);
  assert.throws(() => vaultLib.importKeyBackup(vault, backup, 'wrong passphrase!!'), /Wrong passphrase/);
  vaultLib.importKeyBackup(vault, backup, PASS);
  vaultLib.setActiveKey(vault, 3);
  assert.strictEqual(vault.activeKeyId, 3);
  assert.throws(() => vaultLib.removePrivate(vault, 3), /active/);
});

test('machine id is stable per computer and differs between computers', () => {
  const a1 = setup({ guid: 'X' }).lic.machineId();
  const a2 = setup({ guid: 'X' }).lic.machineId();
  const b = setup({ guid: 'Y' }).lic.machineId();
  assert.ok(a1.equals(a2));
  assert.ok(!a1.equals(b));
});

test('machine id falls back to a stored random id when the OS gives none', () => {
  const store = memoryStore();
  const l1 = createLicense({ store, publicKeys: [], readGuid: () => null });
  const l2 = createLicense({ store, publicKeys: [], readGuid: () => null });
  assert.ok(l1.machineId().equals(l2.machineId()));
});

test('name length limit and signature size', () => {
  const { vault, lic } = setup();
  assert.throws(() => vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'x'.repeat(41) }), /too long/);
  const code = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'City Hospital' });
  assert.ok(code.replace(/-/g, '').length < 220);
  assert.ok(crypto.randomBytes(1)); // keep crypto import used
});

test('activation survives a server restart (same database, same keys)', () => {
  const { vault, publicKeys, store, lic, clock } = setup();
  const code = vaultLib.issue(vault, PASS, { purpose: 'activate', requestCode: lic.getStatus().requestCode, customer: 'A' });
  assert.ok(lic.activate(code).ok);
  const restarted = createLicense({ store, publicKeys, now: () => clock.t, readGuid: () => 'GUID-A' });
  assert.strictEqual(restarted.isActivated(), true);
  // the same database copied to a different computer does not stay activated
  const copied = createLicense({ store, publicKeys, now: () => clock.t, readGuid: () => 'GUID-OTHER' });
  assert.strictEqual(copied.isActivated(), false);
});
