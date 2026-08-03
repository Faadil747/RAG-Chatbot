import { PrismaClient } from "@prisma/client";

// Single shared PrismaClient instance for the process. Using a global in
// dev prevents ts-node-dev's hot-reload from exhausting DB connections.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
