import pino from "pino";
import pinoHttp from "pino-http";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "token",
      "otp",
    ],
    remove: true,
  },
});

export const requestLogger = pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === "/" || (req.url ?? "").startsWith("/uploads") },
  customProps: (rawReq) => {
    const req = rawReq as typeof rawReq & { res: { locals: { requestId?: string } }; user?: { id?: string } };
    return {
      requestId: req.res.locals.requestId,
      userId: req.user?.id,
    };
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: () => "request completed",
  customErrorMessage: () => "request failed",
  serializers: {
    req: (req) => ({ method: req.method, path: req.url.split("?")[0] }),
    res: (res) => ({ status: res.statusCode }),
  },
});
