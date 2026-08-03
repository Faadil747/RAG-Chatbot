import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { formatErrorMessage } from "../utils/formatError";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    res.status(400).json({ error: `Invalid request: ${message}` });
    return;
  }

  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File exceeds the 15MB size limit"
        : err.message;
    res.status(400).json({ error: message });
    return;
  }

  // Prisma errors carry large, multi-line, implementation-detail-laden
  // messages (query snippets, file paths, stack-like content). Log the
  // full error server-side but return a concise, safe summary to clients
  // (formatErrorMessage handles the sanitization; only the status code
  // differs by error subtype).
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    console.error("Database connection error:", err);
    res.status(503).json({ error: formatErrorMessage(err) });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Database request error:", err);
    res.status(400).json({ error: formatErrorMessage(err) });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error("Database validation error:", err);
    res.status(400).json({ error: formatErrorMessage(err) });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: formatErrorMessage(err) || "Internal server error" });
}
