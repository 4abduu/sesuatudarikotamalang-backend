export interface NotificationEmail {
  subject: string;
  title: string;
  lines: Array<{ label: string; value: string }>;
  orderId?: string;
  intro?: string;
  footer?: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

export function adminOrderUrl(orderId: string): string {
  const base = new URL(process.env.ADMIN_WEB_URL || "https://admin.sesuatudarikotamalang.my.id");
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) {
    throw new Error("ADMIN_WEB_URL harus URL HTTP/HTTPS tanpa kredensial");
  }
  return new URL(`/pesanan/${encodeURIComponent(orderId)}`, base).href;
}

export function renderNotificationEmail(notification: NotificationEmail) {
  const url = notification.orderId ? adminOrderUrl(notification.orderId) : undefined;
  const footer = notification.footer ?? "Buka dashboard admin untuk melihat detail dan status terbaru.";
  const rows = notification.lines.map(({ label, value }) =>
    `<tr><td style="padding:10px 12px 10px 0;vertical-align:top;color:#6B5D4F;border-bottom:1px solid #E4D5BA">${escapeHtml(label)}</td><td style="padding:10px 0;overflow-wrap:anywhere;border-bottom:1px solid #E4D5BA">${escapeHtml(value)}</td></tr>`).join("");
  return {
    html: `<div style="background:#F2E8D3;padding:24px;font-family:Arial,sans-serif;color:#2B211A"><div style="max-width:600px;margin:auto;background:#FCF7EB;border-radius:16px;padding:24px"><p style="color:#A8452B;font-weight:bold">Sesuatu DariKota Malang</p><h2>${escapeHtml(notification.title)}</h2>${notification.intro ? `<p>${escapeHtml(notification.intro)}</p>` : ""}<table style="width:100%;border-collapse:collapse">${rows}</table>${url ? `<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#A8452B;color:white;text-decoration:none;padding:14px 22px;border-radius:24px">Buka detail pesanan</a></p><p style="font-size:12px;overflow-wrap:anywhere">Jika tombol tidak terbuka: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ""}<p style="font-size:13px;color:#6B5D4F">${escapeHtml(footer)}</p></div></div>`,
    text: [notification.title, notification.intro, ...notification.lines.map(({ label, value }) => `${label}: ${value}`), url ? `Buka detail pesanan: ${url}` : "", footer].filter(Boolean).join("\n\n"),
  };
}

interface OrderEmailItem {
  quantity: number;
  priceSnapshot: number;
  product?: { name: string } | null;
  variant?: { combination: unknown } | null;
}

export function orderItemEmailLines(items: OrderEmailItem[]) {
  return items.map((item, index) => ({
    label: `Barang ${index + 1}`,
    value: `${item.product?.name || "Produk"} | ${Array.isArray(item.variant?.combination) && item.variant.combination.length ? item.variant.combination.join(" / ") : "Varian default"} | ${item.quantity} unit × ${rupiah(item.priceSnapshot)} | Subtotal ${rupiah(item.quantity * item.priceSnapshot)}`,
  }));
}

export function welcomeNotification(name: string): NotificationEmail {
  return {
    subject: "Selamat datang di Sesuatu DariKota Malang",
    title: `Selamat datang, ${name}!`,
    intro: "Akunmu berhasil dibuat. Temukan karya kreator lokal dan oleh-oleh khas Malang di aplikasi Sesuatu DariKota Malang.",
    lines: [
      { label: "Mulai belanja", value: "Pilih produk dan variannya, lalu beli langsung atau kumpulkan di keranjang." },
      { label: "Pembelian pickup", value: "Pilih jadwal pengambilan, lanjutkan ke metode pembayaran, dan pantau status di Riwayat Pesanan. Tunjukkan QR pesanan saat mengambil barang di toko." },
      { label: "Butuh bantuan?", value: "Baca Panduan Penggunaan pada tab Akun atau hubungi help.sesuatudarikotamalang@gmail.com." },
    ],
    footer: "Email ini dikirim karena alamatmu digunakan untuk membuat akun baru. Jika kamu tidak membuat akun ini, hubungi help.sesuatudarikotamalang@gmail.com. Jangan bagikan password atau kode OTP kepada siapa pun.",
  };
}
