require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/auth.routes");
const productsRoutes = require("./routes/products.routes");
const ordersRoutes = require("./routes/orders.routes");
const artisansRoutes = require("./routes/artisans.routes");
const reviewsRoutes = require("./routes/reviews.routes");
const adminRoutes = require("./routes/admin.routes");
const paymentsRoutes = require("./routes/payments.routes");
const notificationsRoutes = require("./routes/notifications.routes");

const app = express();

// Helmet — Security HTTP headers (HSTS, noSniff, XSS filter, dll.)
app.use(helmet());

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
      return callback(new Error("Blocked by CORS policy"));
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

  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const { startOrderStatusJob } = require("./jobs/orderStatusJob");

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  startOrderStatusJob();
});

