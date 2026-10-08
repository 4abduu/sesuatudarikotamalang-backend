require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const path = require("path");

// Fail-fast env check
const requiredEnvs = ["DATABASE_URL", "JWT_SECRET"];
if (process.env.NODE_ENV === "production") {
  requiredEnvs.push("MIDTRANS_SERVER_KEY", "GOOGLE_CLIENT_ID", "RESEND_API_KEY", "CORS_ALLOWED_ORIGINS");
}

const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);
if (missingEnvs.length > 0) {
  console.error(`[FATAL ERROR] Missing required environment variables: ${missingEnvs.join(", ")}`);
  process.exit(1);
}

const optionalEnvs = ["MIDTRANS_SERVER_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "CORS_ALLOWED_ORIGINS"].filter(
  (env) => !requiredEnvs.includes(env)
);
const missingOptionals = optionalEnvs.filter((env) => !process.env[env]);
if (missingOptionals.length > 0) {
  console.warn(`[WARNING] Optional environment variables not set: ${missingOptionals.join(", ")}`);
}
const authRoutes = require("./routes/auth.routes");
const productsRoutes = require("./routes/products.routes");
const ordersRoutes = require("./routes/orders.routes");
const artisansRoutes = require("./routes/artisans.routes");
const reviewsRoutes = require("./routes/reviews.routes");
const adminRoutes = require("./routes/admin.routes");
const paymentsRoutes = require("./routes/payments.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const searchRoutes = require("./routes/search.routes");
const uploadRoutes = require("./routes/upload.routes");

const app = express();

// F-04: Trust proxy di belakang reverse proxy (Railway, Render, Nginx)
if (process.env.TRUST_PROXY) {
  const trustValue = process.env.TRUST_PROXY === "true" ? 1 : isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY);
  app.set("trust proxy", trustValue);
}

// Helmet — Security HTTP headers (HSTS, noSniff, XSS filter, dll.)
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Serve static uploaded files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// CORS — batasi origin di produksi, buka untuk development jika env tidak diset
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan request tanpa origin (mobile apps, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // Jika allowedOrigins kosong (dev mode), izinkan semua
      if (allowedOrigins.length === 0) return callback(null, true);
      // Cek apakah origin ada di whitelist
      if (allowedOrigins.includes(origin)) return callback(null, true);
      
      // F-11: Lempar error dengan status 403 agar tidak menjadi Internal Server Error 500
      const err = new Error("Blocked by CORS policy");
      err.status = 403;
      return callback(err);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Sesuatu DariKota Malang API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/artisans", artisansRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/upload", uploadRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler — jangan pernah log password atau token ke console
app.use((err, req, res, next) => {
  // Sanitasi: hapus field sensitif dari body sebelum log
  const sanitizedBody = req.body ? { ...req.body } : {};
  const sensitiveFields = ["password", "oldPassword", "newPassword", "token", "idToken", "code"];
  for (const field of sensitiveFields) {
    if (sanitizedBody[field]) sanitizedBody[field] = "[REDACTED]";
  }

  console.error("[ERROR]", {
    method: req.method,
    path: req.path,
    body: sanitizedBody,
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });

  const statusCode = err.status || 500;
  // F-11: Jangan bocorkan detail error internal DB / Prisma (status >= 500) di produksi
  const responseMessage =
    statusCode >= 500
      ? process.env.NODE_ENV === "production"
        ? "Terjadi kesalahan internal server"
        : err.message || "Internal server error"
      : err.message;

  res.status(statusCode).json({ error: responseMessage });
});

// F-11: Handler unhandledRejection & uncaughtException
process.on("unhandledRejection", (reason, promise) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
});

const { startOrderStatusJob } = require("./jobs/orderStatusJob");

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  startOrderStatusJob();
});

