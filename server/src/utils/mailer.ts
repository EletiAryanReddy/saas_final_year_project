import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export const mailConfigured = !!transporter;

export async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    console.log(`\n[mail:dev] To: ${to}\nSubject: ${subject}\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')}\n`);
    return;
  }
  try {
    await transporter.sendMail({ from: env.smtp.from, to, subject, html });
  } catch (e) {
    console.error('[mail] failed', e);
  }
}

export const mailLayout = (title: string, body: string) => `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#15222B">
  <h2 style="margin:0 0 12px">${title}</h2>${body}
  <p style="color:#5E6B73;font-size:12px;margin-top:24px">CollabSpace</p>
</div>`;
