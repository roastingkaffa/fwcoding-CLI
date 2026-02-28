# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ src/
COPY templates/ templates/
RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM node:20-slim

LABEL org.opencontainers.image.title="fwai" \
      org.opencontainers.image.description="Firmware AI CLI — AI-assisted firmware development with safety guardrails" \
      org.opencontainers.image.source="https://github.com/roastingkaffa/fwcoding-CLI"

# Install common firmware toolchain utilities (optional, keeps image useful)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    cmake \
    make \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built app + production deps
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/templates/ templates/
COPY --from=builder /app/package.json .

# Make the CLI globally accessible
RUN npm link --ignore-scripts 2>/dev/null || ln -s /app/dist/cli.js /usr/local/bin/fwai

# Default working directory for user projects (mount here)
WORKDIR /workspace

ENTRYPOINT ["fwai"]
CMD ["--help"]
