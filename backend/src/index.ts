import fs from "fs";
import { env } from "./config/env";
import { createApp } from "./app";

// Ensure the uploads directory exists at boot. Resume files are only ever
// served back out through GET /api/candidates/:id/resume — the directory
// itself is never statically mounted.
fs.mkdirSync(env.uploadDir, { recursive: true });

const app = createApp();

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
  console.log(`  -> ai-service: ${env.aiServiceUrl}`);
  console.log(`  -> uploads dir: ${env.uploadDir}`);
  console.log(`  -> CORS origins: ${env.corsOrigins.join(", ")}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
