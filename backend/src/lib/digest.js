// Daily competency digest email - HOTC/HOFO/Flight Ops Admin/Alternate get
// one email covering every crew member's Overdue/Due Soon/Not Yet
// Completed items, per the operator's explicit request. Deliberately
// mirrors the Home dashboard's own Needs Attention list (see
// backend/src/routes/dashboard.js) rather than a raw dump of every overdue
// item - the same "already rostered/in hand" items stay excluded, so the
// email highlights exactly the segments that still need action, not
// everything indiscriminately.
const pool = require('../../db/pool');
const { listCrewWithCurrency } = require('../routes/crew');
const { sendEmail } = require('./email');

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
const URGENT_STATUSES = ['overdue', 'important', 'due_soon', 'approaching', 'not_completed'];

function daysOverdue(dueDate) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const today = new Date();
  return Math.round((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
}

// Same "in hand" rule as dashboard.js's own Needs Attention filter and
// CurrencyOverview.jsx's Rostered filter - a plan only counts once actually
// rostered (or issued/completed), and only while its own planned date
// hasn't itself already slipped by.
function isInHand(i) {
  if (i.issued) return true;
  if (!i.plannedDate) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (new Date(i.plannedDate) < today) return false;
  return i.rostered !== undefined ? !!i.rostered : true;
}

async function recipientEmails() {
  const { rows } = await pool.query(
    `SELECT name, email FROM users WHERE role = ANY($1::user_role[]) ORDER BY name ASC`,
    [ADMIN_ROLES],
  );
  return rows;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rowHtml(i, extra) {
  return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(i.member.name)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(i.label)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.dueDate ? escapeHtml(new Date(i.dueDate).toLocaleDateString('en-AU')) : '—'}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(extra || i.overdueReason || '')}</td></tr>`;
}

// Colours match the app's own status colour scheme (Dashboard.jsx
// CARD_STYLES/DueBadge.jsx STYLES) so the email reads as an extension of
// what's already set up in the app, not a new visual language.
function section(title, background, color, rows) {
  if (rows.length === 0) return '';
  return `
    <div style="margin-bottom:20px;">
      <div style="background:${background};color:${color};font-weight:600;padding:8px 12px;border-radius:4px 4px 0 0;">${title} (${rows.length})</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-top:none;">
        <thead><tr style="background:#f6f7f9;">
          <th style="padding:6px 10px;text-align:left;font-size:11px;color:#555;">Crew Member</th>
          <th style="padding:6px 10px;text-align:left;font-size:11px;color:#555;">Item</th>
          <th style="padding:6px 10px;text-align:left;font-size:11px;color:#555;">Due Date</th>
          <th style="padding:6px 10px;text-align:left;font-size:11px;color:#555;">Reason</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}

async function buildDigestHtml() {
  const [members, traineeRows] = await Promise.all([
    listCrewWithCurrency({ archived: false }),
    pool.query('SELECT id, first_name, last_name FROM trainees WHERE archived = false').then((r) => r.rows),
  ]);

  // A crew profile still an active LOFT trainee reading "overdue" is
  // expected, not something needing action - mirrors dashboard.js's own
  // isActiveLoftTrainee exactly.
  const activeTraineeIds = new Set(traineeRows.map((t) => t.id));
  const activeTraineeNames = new Set(traineeRows.map((t) => `${t.first_name} ${t.last_name}`.trim().toLowerCase()));
  const isActiveLoftTrainee = (member) => (
    (member.traineeId && activeTraineeIds.has(member.traineeId))
    || activeTraineeNames.has(member.name.trim().toLowerCase())
  );

  const allItems = members.flatMap((m) => m.allItems.map((item) => ({ ...item, member: m })));
  const attentionItems = allItems.filter((i) => URGENT_STATUSES.includes(i.status) && !isInHand(i) && !isActiveLoftTrainee(i.member));

  const overdue = attentionItems.filter((i) => i.status === 'overdue')
    .sort((a, b) => (b.dueDate ? daysOverdue(b.dueDate) : Infinity) - (a.dueDate ? daysOverdue(a.dueDate) : Infinity))
    .map((i) => rowHtml(i, i.dueDate ? `Overdue by ${daysOverdue(i.dueDate)} day${daysOverdue(i.dueDate) === 1 ? '' : 's'}` : 'Never completed'));

  const dueSoon = attentionItems.filter((i) => i.status === 'important' || i.status === 'due_soon' || i.status === 'approaching')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .map((i) => rowHtml(i, `Due in ${-daysOverdue(i.dueDate)} day${-daysOverdue(i.dueDate) === 1 ? '' : 's'}`));

  const notCompleted = attentionItems.filter((i) => i.status === 'not_completed')
    .sort((a, b) => a.member.name.localeCompare(b.member.name))
    .map((i) => rowHtml(i, 'Not yet completed'));

  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const body = [
    section('Overdue', '#fbe1e1', '#8f1d1d', overdue),
    section('Due Soon', '#fdf2d0', '#8a6100', dueSoon),
    section('Not Yet Completed', '#e5e7eb', '#4b5563', notCompleted),
  ].join('');

  if (overdue.length === 0 && dueSoon.length === 0 && notCompleted.length === 0) {
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;">
      <h2 style="margin:0 0 16px;">Competency Digest - ${today}</h2>
      <p>Nothing needs attention today - every crew member's competencies are current or already rostered.</p>
    </div>`;
  }

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;">
    <h2 style="margin:0 0 16px;">Competency Digest - ${today}</h2>
    ${body}
    <p style="font-size:11px;color:#777;margin-top:20px;">Sent automatically by the Flight Standards System.</p>
  </div>`;
}

async function sendCompetencyDigest() {
  const [recipients, html] = await Promise.all([recipientEmails(), buildDigestHtml()]);
  if (recipients.length === 0) return { sent: 0 };
  await sendEmail({ to: recipients.map((r) => r.email), subject: 'Flight Standards - Competency Digest', html });
  return { sent: recipients.length };
}

module.exports = { buildDigestHtml, sendCompetencyDigest };
