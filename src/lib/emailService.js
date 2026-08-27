/**
 * src/lib/emailService.js
 *
 * Sends the weekly "outstanding styles" email via Resend — same provider
 * and pattern as WNDRR WMS's dailyEmailService.js.
 *
 * Required env vars:
 *   RESEND_API_KEY               — Resend API key
 *   PRODUCT_TIMELINE_EMAIL_TO    — comma-separated recipient list
 *                                  (default: brendan@kohindustries.com, sheridan@kohindustries.com)
 *   PRODUCT_TIMELINE_EMAIL_FROM  — verified sender (default: WNDRR Product Timeline <onboarding@resend.dev>)
 */

const { Resend } = require('resend');
const { getTimelineData } = require('./timelineData');
const { currentStage } = require('./stages');

function percentColour(pct) {
  if (pct >= 100) return '#16a34a';
  if (pct >= 50) return '#0f172a';
  return '#64748b';
}

const DEFAULT_TO = 'brendan@kohindustries.com,sheridan@kohindustries.com';
const DEFAULT_FROM = 'WNDRR Product Timeline <onboarding@resend.dev>';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function daysToLaunchLabel(days) {
  if (days === null || days === undefined) return '—';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  return `${days}d`;
}

function buildHtml({ dateLabel, outstanding, atRiskCount }) {
  const kpiCard = (label, value, colour = '#0f172a') => `
    <td style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:${colour};">${value}</div>
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;">${label}</div>
    </td>`;

  const rows = outstanding.length === 0
    ? `<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8;font-size:13px;">Nothing outstanding — every active style is fully checked off.</td></tr>`
    : outstanding.map((p) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">
          <div style="font-weight:600;color:#0f172a;">${esc(p.name)}</div>
          <div style="font-size:11px;color:#94a3b8;">${esc(p.style_code)}</div>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#475569;">${p.launch_date ? new Date(p.launch_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;color:${p.at_risk ? '#dc2626' : '#475569'};font-weight:${p.at_risk ? '700' : '400'};">${daysToLaunchLabel(p.days_to_launch)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#475569;">${esc(p.currentStageLabel)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#475569;">${esc(p.currentStageOwner || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;color:${percentColour(p.percent_complete)};">${p.percent_complete}%</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:20px 24px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">WNDRR Product Timeline — Weekly Outstanding Styles</div>
      <div style="color:#94a3b8;font-size:13px;margin-top:2px;">${esc(dateLabel)}</div>
    </div>

    <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:0;">
      <table width="100%" cellspacing="8" cellpadding="0" style="margin-bottom:18px;">
        <tr>
          ${kpiCard('Outstanding', outstanding.length)}
          ${kpiCard('At Risk', atRiskCount, atRiskCount > 0 ? '#dc2626' : '#0f172a')}
        </tr>
      </table>

      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Style</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Launch</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;">Days</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Current Stage</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Owner</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;">% Complete</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
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
  const toRaw = process.env.PRODUCT_TIMELINE_EMAIL_TO || DEFAULT_TO;
  const from = process.env.PRODUCT_TIMELINE_EMAIL_FROM || DEFAULT_FROM;

  if (!apiKey) throw new Error('RESEND_API_KEY is not set.');
  const to = toRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) throw new Error('PRODUCT_TIMELINE_EMAIL_TO has no valid recipients.');

  const { stages, products } = await getTimelineData();
  const outstanding = products
    .map((p) => {
      const stage = currentStage(stages, p.stages);
      if (!stage) return null; // fully complete — not outstanding
      const ownerEntry = p.stages[stage.key];
      return { ...p, currentStageLabel: stage.label, currentStageOwner: ownerEntry && ownerEntry.owner_name };
    })
    .filter(Boolean);
  const atRiskCount = outstanding.filter((p) => p.at_risk).length;

  const dateLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney',
  });

  const html = buildHtml({ dateLabel, outstanding, atRiskCount });
  const subject = `WNDRR Product Timeline — ${outstanding.length} Outstanding Style${outstanding.length === 1 ? '' : 's'} (${dateLabel})`;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message || JSON.stringify(error));

  return { sent: true, id: data?.id || null, recipients: to, outstandingCount: outstanding.length, atRiskCount };
}

module.exports = { sendWeeklyOutstandingEmail };
