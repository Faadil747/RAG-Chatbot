# Debian-based (glibc), not -alpine (musl): Prisma's query engine binary
# expects glibc + a matching OpenSSL by default, and the musl build needs an
# exact OpenSSL-version-matched `binaryTargets` entry to avoid
# "Error loading shared library libssl.so.1.1 ... needed by
# libquery_engine-linux-musl.so.node" at runtime. -slim sidesteps that whole
# class of version-matching problem rather than pinning one.

# ---- Build stage ----
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Resume files are stored on local disk under ./uploads — mount a volume
# here in production so uploads survive container restarts/redeploys.
RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 4000

CMD ["node", "dist/index.js"]
