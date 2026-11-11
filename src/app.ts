import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";

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

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  const message = "JWT_SECRET harus memiliki panjang minimal 32 karakter";
  if (process.env.NODE_ENV === "production") {
    console.error(`[FATAL ERROR] ${message}`);
    process.exit(1);
  }
  console.warn(`[WARNING] ${message}`);
}

const optionalEnvs = ["MIDTRANS_SERVER_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "CORS_ALLOWED_ORIGINS"].filter(
  (env) => !requiredEnvs.includes(env)
);
const missingOptionals = optionalEnvs.filter((env) => !process.env[env]);
if (missingOptionals.length > 0) {
  console.warn(`[WARNING] Optional environment variables not set: ${missingOptionals.join(", ")}`);
}

import authRoutes from "./routes/authRoutes";
import productsRoutes from "./routes/productsRoutes";
import ordersRoutes from "./routes/ordersRoutes";
import artisansRoutes from "./routes/artisansRoutes";
import reviewsRoutes from "./routes/reviewsRoutes";
import adminRoutes from "./routes/adminRoutes";
import paymentsRoutes from "./routes/paymentsRoutes";
import notificationsRoutes from "./routes/notificationsRoutes";
import searchRoutes from "./routes/searchRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import categoriesRoutes from "./routes/categoriesRoutes";
import slotsRoutes from "./routes/slotsRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import aiRoutes from "./routes/aiRoutes";
import { apiLimiter } from "./middleware/rateLimiter";
import { requestId } from "./middleware/requestId";
import { logger, requestLogger } from "./logger";
import { errorHandler } from "./middleware/errorHandler";
import compression from "compression";

export { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(requestId);
app.use(requestLogger);

// F-04: Trust proxy di belakang reverse proxy (Railway, Render, Nginx)
if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== "false" && process.env.TRUST_PROXY !== "0") {
  const trustValue = process.env.TRUST_PROXY === "true" ? 1 : isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY);
  app.set("trust proxy", trustValue);
}
if (process.env.NODE_ENV === "production" && !process.env.TRUST_PROXY) {
  logger.warn("TRUST_PROXY belum diset: di belakang reverse proxy semua pengguna terlihat satu IP dan rate limit tidak berguna");
}

// Helmet — Security HTTP headers (HSTS, noSniff, XSS filter, dll.)
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
if (process.env.COMPRESSION_ENABLED !== "false") app.use(compression());

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
      const err: any = new Error("Blocked by CORS policy");
      err.status = 403;
      return callback(err);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Sesuatu DariKota Malang API is running" });
});

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/artisans", artisansRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/slots", slotsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/ai", aiRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  const requestId = res.locals.requestId;
  res.status(404).json({ error: "Rute tidak ditemukan", code: "NOT_FOUND", ...(requestId ? { requestId } : {}) });
});

app.use(errorHandler);

// F-11: Handler unhandledRejection & uncaughtException
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled rejection");
});

process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "uncaught exception");
});

export default app;
