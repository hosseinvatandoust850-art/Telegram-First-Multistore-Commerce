# -----------------------------------------------------------------------------
# Telegram-First Multistore Commerce — production image for Railway
# -----------------------------------------------------------------------------
# Uses a multi-stage build to keep the runtime image small and reproducible.
# Node 22 LTS (>=20 is required by the engine field in package.json).

FROM node:22-slim AS build

WORKDIR /app

# Install the PostgreSQL client tools for logical backups (pg_dump) and
# reproducible app deps. Healthy network access is available during the
# build; the runtime image reuses the tools.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first so Docker layer caching is preserved across code edits.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy the rest of the source and the migration files.
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts

# Compile TypeScript to dist/.
RUN npm run build

# -----------------------------------------------------------------------------
# Runtime stage
# -----------------------------------------------------------------------------
FROM node:22-slim

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends postgresql-client ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create a writable directory for the local storage volume (recommended mount).
RUN mkdir -p /app/storage

# Copy only the compiled output and the migration files (small image).
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY migrations ./migrations

# Drop privileges (app runs as its own user, not root).
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

# Default start: run forward-only migrations then start the web service.
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/src/index.js"]
