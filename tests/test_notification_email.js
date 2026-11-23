const assert = require("assert");
const { renderNotificationEmail, orderItemEmailLines, welcomeNotification, adminOrderUrl } = require("../dist/lib/notificationEmail");

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log("PASS  " + name); }
  catch (error) { failed++; console.error("FAIL  " + name + "\n      " + error.message); }
}

(async () => {
  const originalUrl = process.env.ADMIN_WEB_URL;
  try {
    process.env.ADMIN_WEB_URL = "https://admin.example.test";
    await check("email memuat seluruh varian, jumlah dan harga snapshot", () => {
      const lines = orderItemEmailLines([
        { product: { name: "Kaos" }, variant: { combination: ["L", "Hitam"] }, quantity: 2, priceSnapshot: 15000 },
        { product: { name: "Mug" }, variant: null, quantity: 1, priceSnapshot: 55000 },
        { product: { name: "Kartu" }, variant: { combination: [] }, quantity: 3, priceSnapshot: 5000 },
      ]);
      const output = renderNotificationEmail({ subject: "Pesanan", title: "Pesanan baru", lines, orderId: "order-123" });
      assert.equal(lines.length, 3);
      for (const value of ["Kaos", "L / Hitam", "2 unit", "Rp30.000", "Mug", "Varian default", "Kartu", "Rp15.000"]) {
        assert.ok(output.html.includes(value), value);
        assert.ok(output.text.includes(value), value);
      }
      assert.ok(output.html.includes('href="https://admin.example.test/pesanan/order-123"'));
      assert.ok(output.text.includes("https://admin.example.test/pesanan/order-123"));
    });
    await check("konten email di-escape dan tautan bukan URL executable", () => {
      const output = renderNotificationEmail({ subject: "x", title: '<img src=x onerror="alert(1)">', lines: [{ label: "<b>", value: "A&B<script>" }] });
      assert.ok(!output.html.includes("<img"));
      assert.ok(!output.html.includes("<script>"));
      assert.ok(output.html.includes("A&amp;B&lt;script&gt;"));
      process.env.ADMIN_WEB_URL = "javascript:alert(1)";
      assert.throws(() => adminOrderUrl("id"));
      process.env.ADMIN_WEB_URL = "https://admin.example.test";
      assert.equal(adminOrderUrl("a?b#c"), "https://admin.example.test/pesanan/a%3Fb%23c");
    });
    await check("welcome email punya panduan dan tidak mengklaim email terverifikasi", () => {
      const output = renderNotificationEmail(welcomeNotification("Rani <test>"));
      assert.ok(output.html.includes("Rani &lt;test&gt;"));
      assert.ok(output.text.includes("Jika kamu tidak membuat akun ini"));
      assert.ok(!output.text.toLowerCase().includes("email terverifikasi"));
      assert.ok(output.text.includes("help.sesuatudarikotamalang@gmail.com"));
      assert.ok(!output.html.includes("Buka detail pesanan"));
    });
    await check("welcome gagal atau tanpa konfigurasi tidak melempar error dan tidak mengirim nyata", async () => {
      const { Resend } = require("resend");
      // SDK menyimpan emails pada instance: cegat request HTTP lewat metode post.
      const originalPost = Resend.prototype.post;
      const originalKey = process.env.RESEND_API_KEY;
      let calls = 0;
      try {
        Resend.prototype.post = async () => { calls++; throw new Error("simulasi provider offline"); };
        const { sendWelcomeEmail } = require("../dist/lib/mailer");
        delete process.env.RESEND_API_KEY;
        await sendWelcomeEmail({ id: "test-user", name: "Test", email: "nobody@example.test" });
        assert.equal(calls, 0);
        process.env.RESEND_API_KEY = "re_test_placeholder";
        await sendWelcomeEmail({ id: "test-user", name: "Test", email: "nobody@example.test" });
        assert.equal(calls, 1);
      } finally {
        Resend.prototype.post = originalPost;
        if (originalKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = originalKey;
      }
    });
  } finally {
    if (originalUrl === undefined) delete process.env.ADMIN_WEB_URL;
    else process.env.ADMIN_WEB_URL = originalUrl;
  }
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
