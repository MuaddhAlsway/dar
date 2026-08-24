# Client2 — Contact Form System

Production-ready contact form for a React (Vite) landing page deployed on Vercel.
Submissions are delivered by email through **Zoho SMTP** using **Nodemailer** via a
**Vercel Serverless Function**.

---

## Final Folder Structure

```
project/
├── api/
│   └── contact.js          # Vercel serverless function (validation + Nodemailer)
├── src/
│   ├── components/
│   │   └── ContactForm.jsx # Accessible controlled form component
│   ├── App.jsx             # Landing page layout
│   ├── main.jsx            # React entry point
│   └── styles.css          # Pure CSS (responsive, RTL-friendly)
├── public/                 # Static images
├── .env.example            # Template for environment variables
├── .gitignore              # Keeps .env / secrets out of git
├── index.html
├── package.json
├── vercel.json
└── README.md
```

---

## 1. Installation

Requirements: **Node.js 18+** (20+ recommended) and npm.

```bash
git clone <your-repo-url>
cd client2
npm install
cp .env.example .env    # Windows: copy .env.example .env
```

Then fill in the three values inside `.env` (see [Environment Variables](#5-environment-variables)).

## 2. Local Development

```bash
npm run dev      # Vite dev server -> http://localhost:5173
npm run build    # Production build into dist/
npm run preview  # Preview the production build locally
```

> The frontend alone (`npm run dev`) does **not** run `/api/contact`.
> To test the full flow (form → API → email) locally use the Vercel CLI:
>
> ```bash
> npm i -g vercel
> vercel dev
> ```
>
> `vercel dev` serves both the Vite app and the serverless function, and loads
> variables from `.env`.

### Quick smoke test of the API

```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","phone":"+966500000000","message":"Hello from curl"}'
```

Expected: `{ "success": true, "message": "Your message has been sent successfully." }`

## 3. Zoho SMTP Setup

The function sends through Zoho's SMTP server:

| Setting | Value |
|---|---|
| Host | `smtp.zoho.com` |
| Port | `465` |
| Secure | `true` (implicit TLS) |
| User | your Zoho email address |

1. Log in to your Zoho mailbox at **https://mail.zoho.com**.
2. Confirm IMAP access is enabled: **Settings ⚙ → Mail Accounts → IMAP Access**
   → enable *IMAP Access* (SMTP is enabled alongside it).
3. Note the exact email address — it must be used as `ZOHO_EMAIL`.

If you are outside the US/EU data centers (e.g. `.com.au`, `.eu`, `.in`,
`.jp` accounts), the host differs (`smtp.zoho.eu`, `smtp.zoho.in`, …).
Update `api/contact.js` accordingly if mail fails to connect.

## 4. Zoho App Password Setup

Zoho blocks plain account passwords for SMTP. Use an **application-specific password**:

1. Go to **https://accounts.zoho.com** → **Security** → **App Passwords**.
   (Direct link: https://accounts.zoho.com/home#security/app-password)
2. Click **Generate New Password**.
3. Enter a name such as `contact-form-vercel`.
4. Copy the generated password (shown once!) — this is your `ZOHO_APP_PASSWORD`.
5. Paste it into `.env` / Vercel env vars exactly as generated (no spaces).

> 🔐 **Security note:** if a password has ever been shared in chat, screenshots,
> or commits, revoke it in the same page and generate a new one.

## 5. Environment Variables

| Variable | Purpose | Example |
|---|---|---|
| `ZOHO_EMAIL` | Zoho mailbox used to authenticate and send | `hani.derar@daralhadarah.net` |
| `ZOHO_APP_PASSWORD` | App-specific password from step 4 | `xxxxxxxxxxxxxx` |
| `ADMIN_EMAIL` | Inbox that receives form submissions | `sales@daralhadarah.net` |

- **Local:** put them in `.env` (already gitignored — never commit it).
- **Production:** set them in Vercel (next section).

These are read **only** in `api/contact.js` on the server; nothing is exposed to
the browser bundle.

Emails arrive with subject **“New Contact Form Submission”** and contain:
Full Name, Email, Phone Number, Message, Submission Date & Time (Asia/Riyadh),
and Sender IP when available (`x-forwarded-for`). `replyTo` is set to the
visitor's email so you can reply directly.

## 6. Vercel Deployment

The project is a standard Vite app with an `/api` folder — Vercel auto-detects both.

### Option A — Git integration (recommended)

1. Push the repo to GitHub/GitLab/Bitbucket.
2. In https://vercel.com → **Add New… → Project** → import the repository.
3. Framework preset is detected as **Vite** (see `vercel.json`).
4. Before deploying, open **Settings → Environment Variables** and add:

   ```
   ZOHO_EMAIL         = hani.derar@daralhadarah.net
   ZOHO_APP_PASSWORD  = <app password>
   ADMIN_EMAIL        = sales@daralhadarah.net
   ```

   Enable them for *Production*, *Preview*, and *Development*.
5. Click **Deploy**. Every push to `main` now deploys automatically.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel                     # first deploy (preview)
vercel --prod              # production deploy
vercel env add ZOHO_EMAIL production        # add each variable
```

The API endpoint will live at:

```
https://<your-project>.vercel.app/api/contact
```

### HTTP responses

| Status | Meaning |
|---|---|
| `200` | Email sent |
| `400` | Validation failed (per-field `errors` returned) |
| `405` | Method not allowed (POST only) |
| `413` | Request body too large (>10 KB) |
| `415` | Content-Type not JSON |
| `500` | Server/config error |

## 7. Custom Domain Setup

1. Buy the domain from any registrar (or Vercel: **Add New… → Domain**).
2. In Vercel → your project → **Settings → Domains** → **Add** → enter
   e.g. `daralhadarah.net` and `www.daralhadarah.net`.
3. Point DNS to Vercel (choose one):
   - **Nameservers:** change registrar NS to `ns1.vercel-dns.com` / `ns2.vercel-dns.com`, or
   - **A record:** `@ → 76.76.21.21`, and **CNAME:** `www → cname.vercel-dns.com`.
4. Wait for DNS propagation (minutes–48h). Vercel issues HTTPS certificates
   automatically.
5. Update any absolute references to the new domain.

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `500 Server configuration error` | Env vars missing in Vercel → add all three and **redeploy** (env changes need a redeploy). |
| `EAUTH` / `535 Authentication failed` | Wrong `ZOHO_APP_PASSWORD`, spaces around it, or you used the normal account password. Regenerate the app password. |
| `ECONNREFUSED` / connection timeout | Wrong data-center host. Use `smtp.zoho.eu` / `smtp.zoho.in` etc. per your Zoho region, port `465`. |
| `EDNS` / `ETIMEDOUT` on Vercel only | Rare outbound-SMTP restriction — Hobby plan allows it, but check Vercel status page. |
| Email never arrives (no error) | Check spam/junk of ADMIN_EMAIL; confirm the address exists; check Zoho “Sent” folder for the message. |
| Form returns 400 but fields look valid | Inspect the `errors` object in the network tab — server trims/collapses whitespace before validating. |
| `Method not allowed` | You issued GET instead of POST — only POST is accepted. |
| Works locally, fails on Vercel | Env vars were added after deploy → redeploy; or typo in variable names (case-sensitive). |
| iOS zooms into inputs | Inputs already use `font-size:16px` — keep it that way. |

---

## Security Summary

- Credentials live only in server-side environment variables — never bundled into frontend JS.
- All input is sanitized (control characters stripped, trimmed) and HTML-escaped in the email template.
- Strict validation mirrors between client and server; oversized/malformed bodies are rejected early.
- Only POST is accepted; structured JSON errors everywhere; generic messages leak no internals.
