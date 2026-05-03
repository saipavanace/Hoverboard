import nodemailer from 'nodemailer';

/** SMTP password from env (Docker/K8s secret) overrides file config. */
export function resolvedSmtpPassword(cfg) {
  const env = process.env.HOVERBOARD_SMTP_PASS;
  if (env != null && String(env).trim() !== '') return String(env);
  return cfg?.notifications?.smtp?.pass ?? '';
}

/** True when SMTP host and a From identity exist (password optional for open relays). */
export function smtpConfigured(cfg) {
  const s = cfg?.notifications?.smtp;
  if (!s?.host) return false;
  const fromAddr = s.from?.address || s.user;
  return Boolean(fromAddr);
}

/**
 * @returns {import('nodemailer').Transporter | null}
 */
export function createMailTransport(cfg) {
  const smtp = cfg?.notifications?.smtp;
  if (!smtp?.host) return null;
  const pass = resolvedSmtpPassword(cfg);
  const port = Number(smtp.port) || 587;
  const opts = {
    host: smtp.host,
    port,
    secure: Boolean(smtp.secure),
  };
  if (smtp.user) {
    opts.auth = { user: smtp.user, pass };
  }
  return nodemailer.createTransport(opts);
}

function formatFrom(cfg) {
  const smtp = cfg.notifications.smtp;
  const addr = smtp.from?.address || smtp.user;
  if (!addr) return null;
  if (smtp.from?.name) return `"${smtp.from.name}" <${addr}>`;
  return addr;
}

/**
 * @param {string | string[]} to
 */
export async function sendMail(cfg, { to, subject, text, html }) {
  const transport = createMailTransport(cfg);
  if (!transport) {
    return { ok: false, error: 'SMTP host not configured' };
  }
  const from = formatFrom(cfg);
  if (!from) {
    return { ok: false, error: 'From address not configured (notifications.smtp.from.address or smtp.user)' };
  }
  const recipients = Array.isArray(to) ? to : [to];
  const clean = recipients.map((e) => String(e).trim()).filter(Boolean);
  if (!clean.length) {
    return { ok: false, error: 'No recipients' };
  }
  try {
    await transport.sendMail({
      from,
      to: clean.join(', '),
      subject,
      text,
      html: html || undefined,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
