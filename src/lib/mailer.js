const { Resend } = require("resend");

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
  const isChangeEmail = purpose === "ganti_email";
  const subject = isChangeEmail
    ? "Kode Verifikasi Ganti Email — Sesuatu DariKota Malang"
    : "Kode Reset Password — Sesuatu DariKota Malang";

  const title = isChangeEmail ? "Verifikasi Email Baru" : "Reset Password Anda";
  const desc = isChangeEmail
    ? "Gunakan kode OTP berikut untuk memverifikasi perubahan alamat email Anda:"
    : "Gunakan kode OTP berikut untuk mereset password akun Anda:";

  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #A8452B; margin-bottom: 8px;">${title}</h2>
      <p style="color: #444; font-size: 14px;">${desc}</p>
      <div style="background-color: #F2E8D5; padding: 16px; border-radius: 6px; text-align: center; margin: 20px 0;">
        <span style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #A8452B;">${code}</span>
      </div>
      <p style="color: #888; font-size: 12px;">Kode ini berlaku selama 10 menit. Jangan berikan kode ini kepada siapapun.</p>
    </div>
  `;

  const fromEmail = process.env.RESEND_FROM_EMAIL || "Sesuatu DariKota Malang <onboarding@resend.dev>";

  return await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html: htmlContent,
  });
}

module.exports = { sendOtpEmail };
