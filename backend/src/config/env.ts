import dotenv from "dotenv";
import path from "path";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  aiServiceUrl: required("AI_SERVICE_URL", "http://localhost:8000").replace(/\/+$/, ""),
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads"),
  // Comma-separated in production (Vercel prod domain + preview-deploy
  // wildcard + local dev), e.g. "https://app.vercel.app,https://*.vercel.app".
  corsOrigins: required("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
