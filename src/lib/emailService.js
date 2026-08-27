/**
 * src/lib/emailService.js
 *
 * Sends the weekly "outstanding styles" email via Resend — same provider
 * and pattern as WNDRR WMS's dailyEmailService.js.
 *
 * Recipients are managed in Admin > Weekly Email (email_recipients table),
 * not hardcoded or env-configured.
 *
 * Required env vars:
 *   RESEND_API_KEY               — Resend API key
 *   PRODUCT_TIMELINE_EMAIL_FROM  — verified sender (default: WNDRR Product Timeline <onboarding@resend.dev>)
 */

const { Resend } = require('resend');
const { pool } = require('../db');
const { getTimelineData } = require('./timelineData');
const { currentStage, getStageDefaultOwners } = require('./stages');

function percentColour(pct) {
  if (pct >= 100) return '#16a34a';
  if (pct >= 50) return '#0f172a';
  return '#64748b';
}

const DEFAULT_FROM = 'WNDRR Product Timeline <onboarding@resend.dev>';

async function getRecipientEmails() {
  const result = await pool.query('SELECT email FROM email_recipients ORDER BY email ASC');
  return result.rows.map((r) => r.email);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function daysToLaunchLabel(days) {
  if (days === null || days === undefined) return '—';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  return `${days}d`;
}

// One milestone cell — mirrors the Timeline grid exactly: N/A (grey) if
// this milestone doesn't apply to this product; otherwise a tick (always,
// regardless of boolean/date type) plus the owner's name plus the
// completion date, all three whenever it's done. Not done yet shows a
// dash, the configured default owner for this stage if one's set
// (italicised — it's a prediction, not a confirmed owner, same as the
// Timeline), and — for a date-type stage with a due_date — "Due ..." in
// place of the (blank) completion date.
function stageCellHtml(stage, entry, defaultOwnerName) {
  if (entry && entry.not_applicable) {
    return `<span style="color:#94a3b8;">N/A</span><div style="font-size:9px;color:#94a3b8;margin-top:2px;">&nbsp;</div><div style="font-size:9px;color:#94a3b8;">&nbsp;</div>`;
  }
  const done = entry && entry.completed_at;
  const tickLine = done
    ? `<span style="color:#16a34a;font-weight:700;">&#10003;</span>`
    : `<span style="color:#cbd5e1;">–</span>`;
  const ownerText = done ? (entry && entry.owner_name) || '—' : defaultOwnerName || '';
  const ownerStyle = done ? 'color:#94a3b8;' : 'color:#cbd5e1;font-style:italic;';
  const ownerLine = `<div style="font-size:9px;${ownerStyle}margin-top:2px;">${ownerText ? esc(ownerText) : '&nbsp;'}</div>`;
  const isDueLabel = !done && stage.type === 'date' && entry && entry.due_date;
  const dateLabel = done
    ? new Date(entry.completed_at).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
    : isDueLabel
      ? `Due ${new Date(entry.due_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}`
      : '';
  const dateColour = isDueLabel ? '#d97706' : '#94a3b8';
  const dateWeight = isDueLabel ? '700' : '400';
  const dateLine = `<div style="font-size:9px;color:${dateColour};font-weight:${dateWeight};">${dateLabel ? esc(dateLabel) : '&nbsp;'}</div>`;
  return `${tickLine}${ownerLine}${dateLine}`;
}

// Product thumbnail + name/style, side by side via a nested table (not
// flexbox) for compatibility with email clients that ignore it.
function productCellHtml(p) {
  const thumb = p.image_url
    ? `<img src="${esc(p.image_url)}" width="56" height="34" alt="" style="width:56px;height:34px;object-fit:contain;border-radius:6px;background:#f8fafc;border:1px solid #e2e8f0;display:block;">`
    : `<div style="width:56px;height:34px;border-radius:6px;background:#f8fafc;border:1px solid #e2e8f0;"></div>`;
  return `
    <table cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td style="padding-right:8px;">${thumb}</td>
      <td>
        <div style="font-weight:600;color:#0f172a;">${esc(p.name)}</div>
        <div style="font-size:11px;color:#94a3b8;">${esc(p.style_code)}</div>
      </td>
    </tr></table>`;
}

function buildHtml({ dateLabel, outstanding, atRiskCount, stages, stageDefaultOwners }) {
  const defaultOwnerByStage = new Map((stageDefaultOwners || []).map((d) => [d.stage_key, d.owner_name]));

  const kpiCard = (label, value, colour = '#0f172a') => `
    <td style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:${colour};">${value}</div>
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;">${label}</div>
    </td>`;

  const milestoneHeaders = stages
    .map((s) => `<th style="padding:8px 6px;text-align:center;font-size:9px;color:#64748b;text-transform:uppercase;white-space:nowrap;">${esc(s.label)}</th>`)
    .join('');

  const rows = outstanding.length === 0
    ? `<tr><td colspan="${4 + stages.length}" style="padding:16px;text-align:center;color:#94a3b8;font-size:13px;">Nothing outstanding — every active style is fully checked off.</td></tr>`
    : outstanding.map((p) => {
        const milestoneCells = stages
          .map((s) => `<td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:center;white-space:nowrap;">${stageCellHtml(s, p.stages[s.key], defaultOwnerByStage.get(s.key))}</td>`)
          .join('');
        return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${productCellHtml(p)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;color:${percentColour(p.percent_complete)};white-space:nowrap;">${p.percent_complete}%</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#475569;white-space:nowrap;">${p.launch_date ? new Date(p.launch_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;color:${p.at_risk ? '#dc2626' : '#475569'};font-weight:${p.at_risk ? '700' : '400'};white-space:nowrap;">${daysToLaunchLabel(p.days_to_launch)}</td>
        ${milestoneCells}
      </tr>`;
      }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px 24px 0;">
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:20px 24px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">WNDRR Product Timeline — Weekly Outstanding Styles</div>
      <div style="color:#94a3b8;font-size:13px;margin-top:2px;">${esc(dateLabel)}</div>
    </div>

    <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:0;border-bottom:0;">
      <table width="100%" cellspacing="8" cellpadding="0">
        <tr>
          ${kpiCard('Outstanding', outstanding.length)}
          ${kpiCard('At Risk', atRiskCount, atRiskCount > 0 ? '#dc2626' : '#0f172a')}
        </tr>
      </table>
    </div>
  </div>

  <!-- Full timeline grid: intentionally NOT capped at 640px like the rest
       of the email, since it needs room for every milestone column. Desktop
       mail clients render it at its natural (wider) width; narrower clients
       scroll or shrink-to-fit, same tradeoff as viewing a wide spreadsheet. -->
  <div style="max-width:100%;overflow-x:auto;background:#fff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:0 24px;">
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;white-space:nowrap;">Style</th>
          <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;white-space:nowrap;">% Complete</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;white-space:nowrap;">Launch</th>
          <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;white-space:nowrap;">Days</th>
          ${milestoneHeaders}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div style="max-width:640px;margin:0 auto;">
    <div style="background:#fff;padding:0 24px 16px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;">
      <p style="font-size:10px;color:#94a3b8;margin:6px 2px 0;"><span style="color:#dc2626;">Red</span> = launch within 14 days and still incomplete.</p>
    </div>
    <div style="text-align:center;color:#94a3b8;font-size:11px;padding:16px;">
      Automated weekly report · WNDRR Product Timeline
    </div>
  </div>
</body></html>`;
}

async function sendWeeklyOutstandingEmail() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PRODUCT_TIMELINE_EMAIL_FROM || DEFAULT_FROM;

  if (!apiKey) throw new Error('RESEND_API_KEY is not set.');
  const to = await getRecipientEmails();
  if (to.length === 0) throw new Error('No recipients configured — add one in Admin > Weekly Email.');

  const { stages, products } = await getTimelineData();
  const stageDefaultOwners = await getStageDefaultOwners();
  // A product is "outstanding" if it's not yet fully complete. In practice
  // every active product qualifies now that 100% triggers auto-archiving,
  // but this stays as a defensive filter (e.g. a product with zero stages).
  const outstanding = products.filter((p) => currentStage(stages, p.stages) !== null);
  const atRiskCount = outstanding.filter((p) => p.at_risk).length;

  const dateLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney',
  });

  const html = buildHtml({ dateLabel, outstanding, atRiskCount, stages, stageDefaultOwners });
  const subject = `WNDRR Product Timeline — ${outstanding.length} Outstanding Style${outstanding.length === 1 ? '' : 's'} (${dateLabel})`;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message || JSON.stringify(error));

  return { sent: true, id: data?.id || null, recipients: to, outstandingCount: outstanding.length, atRiskCount };
}

module.exports = { sendWeeklyOutstandingEmail };
