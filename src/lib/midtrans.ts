import midtransClient from "midtrans-client";

// Inisialisasi Snap Client Midtrans menggunakan variabel .env
export const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY || "",
  clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
});

export default { snap };
