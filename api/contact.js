/**
 * Vercel Serverless Function - POST /api/contact
 * ------------------------------------------------
 * Receives contact form submissions as JSON, validates and sanitizes the
 * input, then forwards the message to ADMIN_EMAIL through Zoho SMTP using
 * Nodemailer.
 *
 * Environment variables (server-side only - never exposed to the browser):
 *   ZOHO_EMAIL         - Zoho mailbox used to authenticate/send
 *   ZOHO_APP_PASSWORD  - Zoho app-specific password
 *   ADMIN_EMAIL        - Inbox that receives the submissions
 *
 * Responses are always structured JSON:
 *   { success: boolean, message: string, errors?: Record<string,string> }
 */

import nodemailer from 'nodemailer';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/** Hard limit for the raw request body (10 KB is generous for a form). */
const MAX_BODY_BYTES = 10 * 1024;

/** Per-field length limits. */
const LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 100,
  EMAIL_MAX: 254,
  PHONE_MAX: 30,
  PHONE_MIN_DIGITS: 7,
  MESSAGE_MAX: 5000, // message is optional; capped only when supplied
};

/**
 * Pragmatic email pattern: one "@", no whitespace, a dot-separated domain
 * with a TLD of at least 2 characters. The final proof of deliverability
 * is always the SMTP conversation itself.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Phone: digits with optional separators (+ spaces ( ) - .), nothing else. */
const PHONE_REGEX = /^[+()\-.\s\d]+$/;

/** Business timezone used when rendering date/time inside the email. */
const TIMEZONE = 'Asia/Riyadh';

/* ------------------------------------------------------------------ */
/* Helpers - HTTP                                                      */
/* ------------------------------------------------------------------ */

/**
 * Send a JSON response. Centralizes status code + content-type handling so
 * every exit path of the handler returns a consistent shape.
 */
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/**
 * Read the request body up to `maxBytes`.
 * Rejects (returns null) oversized payloads early instead of buffering them,
 * which protects the function from memory abuse.
 */
function readBody(req, maxBytes) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        resolve(null); // too large -> caller responds 413
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

/* ------------------------------------------------------------------ */
/* Helpers - sanitization & validation                                 */
/* ------------------------------------------------------------------ */

/**
 * Sanitize a user-supplied string:
 *  - strip control characters (except \n and \t in messages),
 *  - normalize line endings,
 *  - trim surrounding whitespace.
 * Escaping for HTML happens separately, right before building the email.
 */
function sanitizeText(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  let text = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = multiline
    ? text.replace(/[^\P{C}\n\t]/gu, '') // keep \n + \t, drop other control chars
    : text.replace(/[\p{C}]/gu, ' '); // collapse any control char to space

  return multiline ? text.trim() : text.replace(/\s+/g, ' ').trim();
}

/** Escape HTML special characters before injecting values into the template. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validate sanitized fields.
 * @returns {{ name?: string, email?: string, phone?: string, message?: string }}
 *          an object of field -> error message; empty when everything is valid.
 */
function validateFields(fields) {
  const errors = {};
  const { name, email, phone, message } = fields;

  if (!name) {
    errors.name = 'Full name is required.';
  } else if (
    name.length < LIMITS.NAME_MIN ||
    name.length > LIMITS.NAME_MAX
  ) {
    errors.name = `Name must be between ${LIMITS.NAME_MIN} and ${LIMITS.NAME_MAX} characters.`;
  }

  if (!email) {
    errors.email = 'Email address is required.';
  } else if (
    email.length > LIMITS.EMAIL_MAX ||
    !EMAIL_REGEX.test(email)
  ) {
    errors.email = 'A valid email address is required.';
  }

  if (!phone) {
    errors.phone = 'Phone number is required.';
  } else if (
    phone.length > LIMITS.PHONE_MAX ||
    !PHONE_REGEX.test(phone) ||
    phone.replace(/\D/g, '').length < LIMITS.PHONE_MIN_DIGITS
  ) {
    errors.phone = 'A valid phone number is required.';
  }

  /* Message is optional (removed from the form) - only enforce the cap
     when a value is actually supplied. */
  if (message && message.length > LIMITS.MESSAGE_MAX) {
    errors.message = `Message must not exceed ${LIMITS.MESSAGE_MAX} characters.`;
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* Helpers - email delivery                                            */
/* ------------------------------------------------------------------ */

/**
 * Create (and cache across warm invocations) the Nodemailer transporter.
 * Reusing the module-level cache avoids a fresh SMTP handshake on every call.
 */
let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465, // implicit TLS
    secure: true, // true == TLS on connect (port 465)
    auth: {
      user: process.env.ZOHO_EMAIL,
      pass: process.env.ZOHO_APP_PASSWORD,
    },
  });

  return cachedTransporter;
}

/** Extract the best-guess client IP from Vercel proxy headers. */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // x-forwarded-for can list several proxies; the first entry is the client.
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'Unknown';
}

/** Build the plain-text and HTML versions of the notification email. */
function buildEmailContent({ name, email, phone, message }, senderIp) {
  const now = new Date();

  const submissionDate = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    dateStyle: 'full',
  }).format(now);

  const submissionTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    timeStyle: 'medium',
  }).format(now);

  const rows = [
    ['Full Name', name],
    ['Email', email],
    ['Phone Number', phone],
    ['Submission Date', `${submissionDate}`],
    ['Submission Time', `${submissionTime} (${TIMEZONE})`],
    ['Sender IP', senderIp],
  ];

  const text =
    'New Contact Form Submission\n' +
    '----------------------------------------\n' +
    rows.map(([label, value]) => `${label}: ${value}`).join('\n') +
    (message ? `\nMessage:\n${message}\n` : '\n');

  const htmlRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;font-weight:bold;background:#f6f4ec;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  /* Message section is rendered only when the visitor supplied one. */
  const messageHtmlRow = message
    ? `
        <tr>
          <td colspan="2" style="padding:8px 12px;">
            <strong>Message:</strong>
            <div style="margin-top:8px;padding:12px;background:#faf9f4;border-left:3px solid #00008b;white-space:pre-wrap;line-height:1.6;">${escapeHtml(message)}</div>
          </td>
        </tr>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0ddcf;border-radius:8px;overflow:hidden;">
      <div style="background:#00008b;color:#ffffff;padding:16px 24px;">
        <h2 style="margin:0;font-size:18px;">New Contact Form Submission</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#222222;">
        ${htmlRows}${messageHtmlRow}
      </table>
    </div>`;

  return { subject: 'New Contact Form Submission', text, html };
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export default async function handler(req, res) {
  /* ---- Centralized error handling wraps every fallible step below ---- */
  try {
    /* 1. Method guard: this endpoint accepts POST only. */
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, {
        success: false,
        message: 'Method not allowed. Use POST.',
      });
    }

    /* 2. Fail fast if the environment is misconfigured. */
    const { ZOHO_EMAIL, ZOHO_APP_PASSWORD, ADMIN_EMAIL } = process.env;
    if (!ZOHO_EMAIL || !ZOHO_APP_PASSWORD || !ADMIN_EMAIL) {
      console.error(
        '[contact] Missing environment variables. Required: ZOHO_EMAIL, ZOHO_APP_PASSWORD, ADMIN_EMAIL.'
      );
      return sendJson(res, 500, {
        success: false,
        message: 'Server configuration error. Please try again later.',
      });
    }

    /* 3. Content-Type guard: only JSON bodies are accepted. */
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.includes('application/json')) {
      return sendJson(res, 415, {
        success: false,
        message: 'Unsupported Media Type. Expected application/json.',
      });
    }

    /* 4. Read + parse the body (reject empty / oversize / malformed). */
    const rawBody = await readBody(req, MAX_BODY_BYTES);
    if (rawBody === null) {
      return sendJson(res, 413, {
        success: false,
        message: 'Request body too large.',
      });
    }
    if (!rawBody.trim()) {
      return sendJson(res, 400, {
        success: false,
        message: 'Empty request body.',
      });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: 'Malformed JSON body.',
      });
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return sendJson(res, 400, {
        success: false,
        message: 'Invalid request body.',
      });
    }

    /* 5. Sanitize all user data before anything touches it again. */
    const fields = {
      name: sanitizeText(body.name),
      email: sanitizeText(body.email),
      phone: sanitizeText(body.phone),
      message: sanitizeText(body.message, { multiline: true }),
    };

    /* 6. Validate and reject malformed submissions with per-field errors. */
    const errors = validateFields(fields);
    if (Object.keys(errors).length > 0) {
      return sendJson(res, 400, {
        success: false,
        message: 'Validation failed. Please check the highlighted fields.',
        errors,
      });
    }

    /* 7. Deliver the notification email via Zoho SMTP. */
    const senderIp = getClientIp(req);
    const { subject, text, html } = buildEmailContent(fields, senderIp);

    await getTransporter().sendMail({
      from: `"Website Contact Form" <${ZOHO_EMAIL}>`,
      to: ADMIN_EMAIL,
      replyTo: fields.email, // admin can reply straight to the visitor
      subject,
      text,
      html,
    });

    /* 8. Success. */
    return sendJson(res, 200, {
      success: true,
      message: 'Your message has been sent successfully.',
    });
  } catch (error) {
    /* Any unexpected failure lands here - log details server-side,
       return a safe generic message to the client. */
    console.error('[contact] Unexpected error:', error);
    return sendJson(res, 500, {
      success: false,
      message:
        'An unexpected error occurred while sending your message. Please try again later.',
    });
  }
}
