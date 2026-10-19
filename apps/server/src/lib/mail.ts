import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;

/** Test hook: the test suite captures outgoing mail here instead of SMTP. */
export const outbox: { to: string; subject: string; text: string }[] = [];

export async function sendMail(to: string, subject: string, text: string) {
  if (config.NODE_ENV === 'test') {
    outbox.push({ to, subject, text });
    return;
  }
  if (!transport) {
    logger.warn({ subject }, 'SMTP_URL not configured; email not sent');
    return;
  }
  try {
    await transport.sendMail({ from: config.MAIL_FROM, to, subject, text });
  } catch (err) {
    logger.error({ err, subject }, 'email send failed');
  }
}
