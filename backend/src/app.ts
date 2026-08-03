import express, { Express } from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";
import healthRouter from "./routes/health";
import candidatesRouter from "./routes/candidates";
import searchRouter from "./routes/search";
import chatRouter from "./routes/chat";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(morgan("dev"));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", healthRouter);
  app.use("/api", candidatesRouter);
  app.use("/api", searchRouter);
  app.use("/api", chatRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
