'use strict';

const $ = (id) => document.getElementById(id);
let state = null;

function show(el, on) { el.classList.toggle('hidden', !on); }
function clearMsg() { $('err').style.display = 'none'; $('ok').style.display = 'none'; }
function err(m) { clearMsg(); $('err').textContent = m; $('err').style.display = 'block'; }
function ok(m) { clearMsg(); $('ok').textContent = m; $('ok').style.display = 'block'; }

function cell(tr, text) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; }

function render() {
  show($('viewCreate'), !state.exists);
  show($('viewUnlock'), state.exists && !state.unlocked);
  show($('viewMain'), !!state.unlocked);
  if (!state.unlocked) { $('resultPanel').classList.add('hidden'); return; }

  $('activeInfo').textContent = `Signing with key ${state.activeKeyId}.`;

  const hb = $('historyBody');
  hb.replaceChildren();
  for (const i of state.issued) {
    const tr = document.createElement('tr');
    cell(tr, i.at.slice(0, 16).replace('T', ' '));
    cell(tr, i.purpose === 'reset' ? 'Reset' : 'Activation');
    cell(tr, i.customer || '—');
    cell(tr, i.purpose === 'reset' ? '—' : i.expires);
    cell(tr, String(i.keyId));
    hb.appendChild(tr);
  }
  show($('historyEmpty'), state.issued.length === 0);

  const kb = $('keysBody');
  kb.replaceChildren();
  for (const k of state.keys) {
    const tr = document.createElement('tr');
    cell(tr, String(k.id));
    cell(tr, k.publicKey.slice(0, 16) + '…');
    cell(tr, k.hasPrivate ? 'On this computer' : 'Removed (in backup)');
    cell(tr, k.id === state.activeKeyId ? 'Active' : 'Spare');
    const td = document.createElement('td');
    const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.marginRight = '6px'; b.addEventListener('click', fn); td.appendChild(b); };
    if (k.hasPrivate) mk('Backup…', () => run(window.issuer.backupKey({ id: k.id }), (r) => r.saved && ok(`Backup saved: ${r.file}`)));
    if (k.hasPrivate && k.id !== state.activeKeyId) {
      mk('Use this key', () => run(window.issuer.setActive({ id: k.id }), () => ok(`Now signing with key ${k.id}.`)));
      mk('Remove private part', () => run(window.issuer.removePrivate({ id: k.id }), (r) => r.removed && ok(`Private part of key ${k.id} removed from this computer.`)));
    }
    tr.appendChild(td);
    kb.appendChild(tr);
  }
}

// Runs an IPC call, shows errors, updates state, calls onOk with the result.
async function run(promise, onOk) {
  const r = await promise;
  if (r.error) { err(r.error); return null; }
  if (r.state) state = r.state;
  render();
  if (onOk) onOk(r);
  return r;
}

async function refresh() {
  const r = await window.issuer.state();
  state = r.state;
  render();
}

$('btnCreate').addEventListener('click', async () => {
  const p = $('newPass').value;
  if (p !== $('newPass2').value) { err('The two passphrases do not match.'); return; }
  $('btnCreate').disabled = true;
  await run(window.issuer.create({ passphrase: p }), () => {
    $('newPass').value = ''; $('newPass2').value = '';
    ok('Keys created. Next: Keys tab → save a backup of each key, then export license-keys.js.');
  });
  $('btnCreate').disabled = false;
});

$('btnUnlock').addEventListener('click', async () => {
  $('btnUnlock').disabled = true;
  await run(window.issuer.unlock({ passphrase: $('unlockPass').value }), () => { $('unlockPass').value = ''; clearMsg(); });
  $('btnUnlock').disabled = false;
});
$('unlockPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnUnlock').click(); });

$('btnLock').addEventListener('click', () => run(window.issuer.lock()));
window.issuer.onLocked(() => { refresh(); err('Locked after 15 minutes without use.'); });

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  for (const name of ['issue', 'history', 'keys']) show($('tab-' + name), t.dataset.tab === name);
  clearMsg();
}));

function updatePurpose() {
  show($('activateFields'), $('purpose').value === 'activate');
}
$('purpose').addEventListener('change', updatePurpose);
document.querySelectorAll('input[name=len]').forEach((r) => r.addEventListener('change', () => {
  $('expiry').disabled = document.querySelector('input[name=len]:checked').value !== 'date';
}));

$('btnIssue').addEventListener('click', async () => {
  const purpose = $('purpose').value;
  const useDate = document.querySelector('input[name=len]:checked').value === 'date';
  if (purpose === 'activate' && useDate && !$('expiry').value) { err('Pick the last valid date, or choose Permanent.'); return; }
  $('btnIssue').disabled = true;
  await run(window.issuer.issue({
    purpose,
    requestCode: $('requestCode').value,
    customer: $('customer').value,
    expiry: purpose === 'activate' && useDate ? $('expiry').value : null,
  }), (r) => {
    $('resultTitle').textContent = purpose === 'reset' ? 'Reset Code' : 'Activation Code';
    $('resultCode').textContent = r.code;
    $('resultPanel').classList.remove('hidden');
    clearMsg();
  });
  $('btnIssue').disabled = false;
});

$('btnCopyCode').addEventListener('click', async () => {
  await window.issuer.copy({ text: $('resultCode').textContent });
  ok('Code copied.');
});

$('btnExportKeys').addEventListener('click', () =>
  run(window.issuer.exportLicenseKeys(), (r) => r.saved && ok(`Saved: ${r.file}. Replace server/license-keys.js with it.`)));
$('btnImport').addEventListener('click', () =>
  run(window.issuer.importBackup(), (r) => r.imported && ok('Key restored from backup.')));

updatePurpose();
refresh();
