'use strict';
/**
 * Alarm log read-model: one row per RECEIVING station per alarm, plus CSV export and the alarm e-mail.
 * Pure read/format code — the alarm flow itself writes the rows (see server.js).
 */
const { db, findClientByCode } = require('./db');

const STATUS_LABEL = {
  acked: 'Acked', delivered: 'Delivered', not_delivered: 'Not Delivered', no_response: 'No Response',
};

// "Doctor" + "srini" -> "Doctor(srini)"; without an OS user just "Doctor"
function who(title, osUser) {
  const t = String(title || '').trim(), u = String(osUser || '').trim();
  return u ? `${t || 'Station'}(${u})` : (t || '—');
}

// Accepts 'YYYY-MM-DD', 'YYYY-MM-DD[T ]HH:MM[:SS[.mmm]]' with optional Z / +hh:mm. Returns
// 'YYYY-MM-DD HH:MM:SS' (UTC, the format SQLite stores), null for empty, undefined for invalid.
function normTime(v, endOfDay) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m) return undefined;
  let iso;
  if (!m[2]) iso = `${m[1]}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
  else iso = `${m[1]}T${m[2]}${m[3] || ':00'}${m[4] || 'Z'}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * @param {{hospital?:string, from?:string, to?:string, limit?:number}} f
 * @returns {{error:string}|{rows:object[]}}
 */
function queryLogRows(f = {}) {
  const from = normTime(f.from, false), to = normTime(f.to, true);
  if (from === undefined || to === undefined) return { error: 'Invalid date' };
  const where = [], args = [];
  if (f.hospital) { where.push('UPPER(hospital_code) = ?'); args.push(String(f.hospital).trim().toUpperCase()); }
  if (from) { where.push('triggered_at >= ?'); args.push(from); }
  if (to)   { where.push('triggered_at <= ?'); args.push(to); }
  const limit = Math.min(Math.max(parseInt(f.limit, 10) || 500, 1), 5000);
  const sql = `
    WITH a AS (
      SELECT * FROM alarm_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY triggered_at DESC, id DESC LIMIT ${limit}
    )
    SELECT a.alarm_id, a.hospital_code, a.triggered_at, a.triggered_by, a.sender_os_user,
           a.room_number AS sent_room, a.system_number, a.acknowledged, a.ack_by, a.no_response, a.delivered_count,
           r.os_user, r.user_title, r.room_label, r.status, r.ack_at
    FROM a LEFT JOIN alarm_recipient r ON r.alarm_id = a.alarm_id
    ORDER BY a.triggered_at DESC, a.id DESC, r.id ASC`;
  const rows = db.prepare(sql).all(...args).map((r) => {
    const hasStation = r.status !== null && r.status !== undefined;
    let status = r.status;
    if (!hasStation) {   // alarm with no station records (nobody else was registered/online) or a pre-upgrade alarm
      status = r.acknowledged ? 'acked' : (r.delivered_count === 0 ? 'not_delivered' : (r.no_response ? 'no_response' : 'delivered'));
    }
    return {
      alarm_id      : r.alarm_id,
      hospital_code : r.hospital_code,
      triggered_at  : r.triggered_at,
      sent_by       : who(r.triggered_by, r.sender_os_user),
      sent_room     : r.sent_room || '—',
      system_number : r.system_number || '',
      received_by   : hasStation ? who(r.user_title, r.os_user) : '—',
      received_room : hasStation ? (r.room_label || '—') : '—',
      // Only a station that really pressed OK has an acknowledging room; everything else is "None"
      acked_by      : hasStation ? (status === 'acked' ? (r.room_label || 'None') : 'None')
                                 : (r.acknowledged && r.ack_by ? r.ack_by : 'None'),
      status,
      status_label  : STATUS_LABEL[status] || status,
    };
  });
  return { rows };
}

// ── CSV ────────────────────────────────────────────────────────────────────────
// Cells starting with = + - @ TAB CR are prefixed with ' so spreadsheets never run them as formulas.
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// UTC text from SQLite -> "YYYY-MM-DD HH:MM:SS" shifted by the viewer's offset (minutes WEST of UTC, as JS reports)
function fmtLocal(utcText, tzOffsetMin) {
  const d = new Date(String(utcText).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return String(utcText || '');
  return new Date(d.getTime() - (tzOffsetMin || 0) * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
function tzLabel(tzOffsetMin) {
  const east = -(tzOffsetMin || 0), sign = east >= 0 ? '+' : '-', a = Math.abs(east);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

function toCsv(rows, tzOffsetMin = 0) {
  const head = ['Time (' + tzLabel(tzOffsetMin) + ')', 'Alarm ID', 'Hospital', 'Sent By', 'Alarm Sent Room', 'System',
                'Received By', 'Received Room', 'Acked By', 'Status'];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([fmtLocal(r.triggered_at, tzOffsetMin), r.alarm_id, r.hospital_code, r.sent_by, r.sent_room, r.system_number,
                r.received_by, r.received_room, r.acked_by, r.status_label].map(csvCell).join(','));
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';   // BOM so Excel reads UTF-8
}

// ── Alarm e-mail ───────────────────────────────────────────────────────────────
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Subject/text/html describing ONE alarm with every station's delivery result. null if the alarm is unknown. */
function buildAlarmEmail(alarmId) {
  const a = db.prepare('SELECT * FROM alarm_log WHERE alarm_id = ?').get(alarmId);
  if (!a) return null;
  const stations = db.prepare('SELECT * FROM alarm_recipient WHERE alarm_id = ? ORDER BY id').all(alarmId);
  const hospital = findClientByCode.get(String(a.hospital_code || '').toUpperCase());
  const hospName = hospital ? `${hospital.client_name} (${a.hospital_code})` : a.hospital_code;
  const sentBy = who(a.triggered_by, a.sender_os_user);
  const when = new Date(a.triggered_at.replace(' ', 'T') + 'Z');
  const whenText = Number.isNaN(when.getTime()) ? a.triggered_at : when.toString();
  const delivered = stations.filter(s => s.status !== 'not_delivered').length;
  const notDelivered = stations.length - delivered;

  const lines = [
    'PANIC ALARM', '',
    `Alarm ID        : ${a.alarm_id}`,
    `Time            : ${whenText}`,
    `Hospital        : ${hospName}`,
    `Sent By         : ${sentBy}`,
    `Alarm Sent Room : ${a.room_number}`,
    `System          : ${a.system_number || '—'}`,
    `Severity        : ${a.severity}`,
    `Message         : ${a.message}`, '',
    `Stations: ${stations.length}  |  Delivered: ${delivered}  |  Not delivered: ${notDelivered}`, '',
  ];
  for (const s of stations) {
    lines.push(`- ${who(s.user_title, s.os_user)} | ${s.room_label || '—'} | ${STATUS_LABEL[s.status] || s.status}`);
  }
  if (!stations.length) lines.push('No other station was registered or online to receive this alarm.');

  const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#57606a">${escHtml(k)}</td><td style="padding:4px 0"><b>${escHtml(v)}</b></td></tr>`;
  const stationRows = stations.map(s =>
    `<tr><td style="padding:5px 10px;border:1px solid #e5e7eb">${escHtml(who(s.user_title, s.os_user))}</td>` +
    `<td style="padding:5px 10px;border:1px solid #e5e7eb">${escHtml(s.room_label || '—')}</td>` +
    `<td style="padding:5px 10px;border:1px solid #e5e7eb">${escHtml(STATUS_LABEL[s.status] || s.status)}</td></tr>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2328">
<h2 style="color:#dc2626;margin:0 0 10px">PANIC ALARM</h2>
<table style="border-collapse:collapse">${row('Alarm ID', a.alarm_id)}${row('Time', whenText)}${row('Hospital', hospName)}${row('Sent By', sentBy)}${row('Alarm Sent Room', a.room_number)}${row('System', a.system_number || '—')}${row('Severity', a.severity)}${row('Message', a.message)}</table>
<p style="margin:14px 0 6px"><b>Stations:</b> ${stations.length} &nbsp;|&nbsp; <b>Delivered:</b> ${delivered} &nbsp;|&nbsp; <b>Not delivered:</b> ${notDelivered}</p>
${stations.length ? `<table style="border-collapse:collapse"><tr style="background:#f7f8fa"><th style="padding:5px 10px;border:1px solid #e5e7eb;text-align:left">Received By</th><th style="padding:5px 10px;border:1px solid #e5e7eb;text-align:left">Received Room</th><th style="padding:5px 10px;border:1px solid #e5e7eb;text-align:left">Status</th></tr>${stationRows}</table>` : '<p>No other station was registered or online to receive this alarm.</p>'}
</div>`;

  return { subject: `PANIC ALARM - ${sentBy} - ${a.room_number} - ${a.hospital_code}`, text: lines.join('\n'), html, hospital };
}

module.exports = { queryLogRows, toCsv, buildAlarmEmail, normTime, who, STATUS_LABEL };
