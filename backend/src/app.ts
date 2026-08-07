import express, { Express } from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";
import healthRouter from "./routes/health";
import candidatesRouter from "./routes/candidates";
import searchRouter from "./routes/search";
import chatRouter from "./routes/chat";
import jobsRouter from "./routes/jobs";
import analyticsRouter from "./routes/analytics";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

/** Matches an origin against the configured allow-list, supporting a `*`
 * wildcard segment (e.g. "https://*.vercel.app" for preview deploys) in
 * addition to exact matches. */
function isOriginAllowed(origin: string): boolean {
  return env.corsOrigins.some((allowed) => {
    if (allowed === origin) return true;
    if (!allowed.includes("*")) return false;
    const pattern = "^" + allowed.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
    return new RegExp(pattern).test(origin);
  });
}

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (server-to-server calls, curl, health checks) --
        // always allow, there's no browser same-origin policy to enforce.
        if (!origin || isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
    })
  );
  app.use(morgan("dev"));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", healthRouter);
  app.use("/api", candidatesRouter);
  app.use("/api", searchRouter);
  app.use("/api", chatRouter);
  app.use("/api", jobsRouter);
  app.use("/api", analyticsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
