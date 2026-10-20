import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;

/** Test hook: the test suite captures outgoing mail here instead of SMTP. */
export const outbox: { to: string; subject: string; text: string }[] = [];

// Subjects carry one-time codes: never log them as-is.
export const redact = (subject: string) => subject.replace(/\d{4,}/g, '••••••');
const escape = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** A plain, readable HTML version alongside the text (text-only automated mail is more often filtered as spam). */
export const html = (text: string) =>
  `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#14121F;max-width:480px">` +
  text
    .split('\n\n')
    .map((p) => `<p>${escape(p).replace(/\b(\d{6})\b/, '<strong style="font-size:28px;letter-spacing:4px">$1</strong>')}</p>`)
    .join('') +
  `<p style="color:#6B6680;font-size:13px">Vybe · private map for friends</p></div>`;

export async function sendMail(to: string, subject: string, text: string) {
  if (config.NODE_ENV === 'test') {
    outbox.push({ to, subject, text });
    return;
  }
  if (!transport) {
    logger.warn({ subject: redact(subject) }, 'SMTP_URL not configured; email not sent');
    return;
  }
  try {
    const r = await transport.sendMail({ from: config.MAIL_FROM, to, subject, text, html: html(text) });
    // Delivery evidence without the address: accepted/rejected counts and the server's reply.
    logger.info({ subject: redact(subject), accepted: r.accepted.length, rejected: r.rejected.length, response: r.response }, 'email sent');
  } catch (err) {
    logger.error({ err, subject: redact(subject) }, 'email send failed');
  }
}
