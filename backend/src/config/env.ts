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
  corsOrigin: required("CORS_ORIGIN", "http://localhost:5173"),
};
