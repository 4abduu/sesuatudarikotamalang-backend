const { Resend } = require("resend");

/* ------------------------------------------------------------------ */
/* Brand tokens (mirror globals.css so email matches the app)         */
/* ------------------------------------------------------------------ */

const BRAND = {
  primary: "#A8452B",           // terracotta
  primaryForeground: "#F7EFDD", // cream on terracotta
  background: "#F2E8D5",        // page cream
  card: "#FBF6EA",              // card cream
  foreground: "#2B211A",        // dark brown text
  mutedForeground: "#6B5D4F",   // muted brown
  border: "#D9C9AC",            // sand border
  secondary: "#E8D9BC",         // deeper cream
  accent: "#6B7A3D",            // moss green
  destructive: "#9B3320",
};

const BRAND_NAME = "Sesuatu DariKota Malang";

/* ------------------------------------------------------------------ */
/* Inline SVG ornaments                                                */
/* ------------------------------------------------------------------ */

function LeafSprigSvg() {
  return `
    <svg width="36" height="36" viewBox="0 0 120 120" fill="none"
         stroke="${BRAND.primaryForeground}" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round"
         opacity="0.55" aria-hidden="true">
      <path d="M60 110 C60 80 60 40 60 14" />
      <path d="M60 30 C48 28 38 22 32 12 C44 10 54 16 60 28" />
      <path d="M60 30 C72 28 82 22 88 12 C76 10 66 16 60 28" />
      <path d="M60 52 C46 50 34 44 26 32 C40 30 52 38 60 50" />
      <path d="M60 52 C74 50 86 44 94 32 C80 30 68 38 60 50" />
      <path d="M60 74 C48 72 38 66 30 56 C42 54 52 60 60 72" />
      <path d="M60 74 C72 72 82 66 90 56 C78 54 68 60 60 72" />
    </svg>`;
}

function HeritageWindowSvg() {
  return `
    <svg width="28" height="28" viewBox="0 0 120 120" fill="none"
         stroke="${BRAND.accent}" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round"
         opacity="0.7" aria-hidden="true">
      <rect x="22" y="22" width="76" height="76" rx="6" />
      <path d="M22 60 H98 M60 22 V98" />
      <path d="M22 22 C40 30 40 50 22 60 M98 22 C80 30 80 50 98 60
               M22 60 C40 70 40 90 22 98 M98 60 C80 70 80 90 98 98" />
    </svg>`;
}

/* ------------------------------------------------------------------ */
/* HTML escape                                                         */
/* ------------------------------------------------------------------ */

function escapeHtml(input) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ */
/* Copy variants                                                       */
/* ------------------------------------------------------------------ */

function copyFor(purpose) {
  if (purpose === "ganti_email") {
    return {
      subject: `Kode Verifikasi Ganti Email — ${BRAND_NAME}`,
      eyebrow: "Verifikasi Email Baru",
      title: "Konfirmasi Email Baru Kamu",
      desc: "Gunakan kode OTP berikut untuk memverifikasi perubahan alamat email akunmu di Sesuatu DariKota Malang:",
    };
  }
  return {
    subject: `Kode Reset Password — ${BRAND_NAME}`,
    eyebrow: "Reset Password",
    title: "Reset Password Akunmu",
    desc: "Gunakan kode OTP berikut untuk mereset password akunmu di Sesuatu DariKota Malang:",
  };
}

/* ------------------------------------------------------------------ */
/* Build branded OTP HTML                                              */
/* ------------------------------------------------------------------ */

function buildOtpHtml(code, purpose) {
  const copy = copyFor(purpose);

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="support-color-scheme" content="light only" />
  <title>${escapeHtml(copy.subject)}</title>
  <!--[if mso]>
  <style>table,tr,td{border-collapse:collapse}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.background};
             font-family:'Poppins','Segoe UI',Roboto,Arial,sans-serif;
             color:${BRAND.foreground};-webkit-text-size-adjust:100%;">
  <!-- Outer wrapper: cream paper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:${BRAND.background};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!-- Card: cream + border + sticker-shadow -->
        <table role="presentation" width="500" cellpadding="0" cellspacing="0"
               style="max-width:500px;width:100%;
                      background:${BRAND.card};
                      border:1px solid ${BRAND.border};
                      border-radius:16px;
                      box-shadow:0 2px 0 rgba(43,33,26,0.06),0 12px 28px -14px rgba(43,33,26,0.28);
                      overflow:hidden;">

          <!-- Header band: terracotta with leaf ornament -->
          <tr>
            <td style="background:${BRAND.primary};padding:20px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-family:'Baloo 2','Poppins',sans-serif;
                             font-weight:800;font-size:17px;color:${BRAND.primaryForeground};
                             letter-spacing:0.2px;">
                      ${escapeHtml(BRAND_NAME)}
                    </p>
                    <p style="margin:2px 0 0;font-size:11px;color:${BRAND.primaryForeground};
                             opacity:0.75;letter-spacing:0.8px;text-transform:uppercase;">
                      Pasar Artisan Kayutangan Heritage
                    </p>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    ${LeafSprigSvg()}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 8px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:600;
                       color:${BRAND.accent};letter-spacing:1.5px;
                       text-transform:uppercase;">
                ${escapeHtml(copy.eyebrow)}
              </p>
              <h2 style="margin:0 0 10px;font-family:'Baloo 2','Poppins',sans-serif;
                         font-weight:800;font-size:22px;line-height:1.25;
                         color:${BRAND.primary};">
                ${escapeHtml(copy.title)}
              </h2>
              <p style="margin:0 0 0;color:${BRAND.mutedForeground};
                       font-size:14px;line-height:1.55;">
                ${escapeHtml(copy.desc)}
              </p>
            </td>
          </tr>

          <!-- OTP badge -->
          <tr>
            <td style="padding:18px 28px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${BRAND.secondary};
                             border:1px dashed ${BRAND.primary};
                             border-radius:12px;padding:22px 16px;text-align:center;">
                    <span style="font-family:'Baloo 2','Poppins',monospace;
                                font-size:32px;font-weight:800;letter-spacing:10px;
                                color:${BRAND.primary};">
                      ${escapeHtml(code)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Helper note -->
          <tr>
            <td style="padding:14px 28px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="background:${BRAND.background};border-radius:10px;">
                <tr>
                  <td style="padding:12px 14px;">
                    <p style="margin:0;font-size:12px;line-height:1.55;
                             color:${BRAND.mutedForeground};">
                      <strong style="color:${BRAND.foreground};">Berlaku 10 menit.</strong>
                      Jangan bagikan kode ini ke siapapun, termasuk admin
                      ${escapeHtml(BRAND_NAME)}. Kami tidak akan pernah
                      memintanya lewat WhatsApp atau telepon.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px 26px;border-top:1px solid ${BRAND.border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    ${HeritageWindowSvg()}
                  </td>
                  <td style="vertical-align:middle;padding-left:10px;">
                    <p style="margin:0;font-size:12px;color:${BRAND.mutedForeground};
                             line-height:1.55;">
                      Email ini dikirim dari ${escapeHtml(BRAND_NAME)}.<br />
                      Jika kamu tidak merasa meminta kode ini, abaikan saja
                      email ini — akunmu tetap aman.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;font-size:11px;color:${BRAND.mutedForeground};
                        opacity:0.7;">
                © ${new Date().getFullYear()} ${escapeHtml(BRAND_NAME)} ·
                Kayutangan Heritage, Malang
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Main: Send OTP Email                                                */
/* ------------------------------------------------------------------ */

/**
 * Mengirimkan email OTP (Reset Password atau Ganti Email) via Resend API
 */
async function sendOtpEmail(to, code, purpose) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[WARN] RESEND_API_KEY belum diisi di .env. Email OTP tidak benar-benar dikirim.");
    console.log(`[SIMULASI OTP] Tujuan: ${to} | Kode: ${code} | Tujuan: ${purpose}`);
    return { id: "simulated-otp" };
  }

  const resend = new Resend(apiKey);
  const copy = copyFor(purpose);
  const htmlContent = buildOtpHtml(code, purpose);

  const fromEmail = process.env.RESEND_FROM_EMAIL || "Sesuatu DariKota Malang <onboarding@resend.dev>";

  return await resend.emails.send({
    from: fromEmail,
    to,
    subject: copy.subject,
    html: htmlContent,
  });
}

module.exports = { sendOtpEmail };
