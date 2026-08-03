import { Prisma } from "@prisma/client";
import { ApiError } from "./ApiError";

/**
 * Reduces any thrown value to a short, safe, single-line message suitable
 * for returning to a client. Prisma errors in particular carry large
 * multi-line messages (query snippets, file paths) that must not be
 * echoed back verbatim. Used both by the global error middleware and by
 * per-item error results (e.g. the candidate upload batch) that build
 * their own response instead of throwing to `next()`.
 */
export function formatErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }

  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    return "Database is unreachable. Please try again shortly.";
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return `Database error (${err.code}): ${firstLine(err.message)}`;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return "Invalid data for database operation.";
  }

  if (err instanceof Error) {
    return firstLine(err.message);
  }

  return "Unknown error";
}

function firstLine(message: string): string {
  return message.trim().split("\n").pop()?.trim() ?? message;
}
