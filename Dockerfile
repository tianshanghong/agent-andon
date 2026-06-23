# syntax=docker/dockerfile:1
#
# Agent Andon — the content-blind hosted relay, as a container.
# Built reproducibly from the public source (the SAME code `andon verify` checks).
# Default command runs the relay; it stores ciphertext only and never holds a key.

# Tip: for a fully reproducible image backing `andon verify`, pin the base by digest
# in BOTH stages — FROM node:22-slim@sha256:<digest> — and bump it deliberately.

# ---- build (needs devDeps: typescript) ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY assets ./assets
RUN npm run build

# ---- runtime (no runtime deps — stdlib only) ----
FROM node:22-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/tianshanghong/agent-andon" \
      org.opencontainers.image.description="Agent Andon — content-blind hosted relay" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
WORKDIR /app
ENV NODE_ENV=production \
    ANDON_RELAY_HOST=0.0.0.0 \
    ANDON_RELAY_PORT=8788 \
    ANDON_DATA_DIR=/data
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY assets ./assets
# non-root + a persistent data dir (hashed tokens + VAPID + subscriptions live here)
RUN mkdir -p /data \
 && groupadd --system andon \
 && useradd --system --gid andon --home-dir /app andon \
 && chown -R andon:andon /app /data
USER andon
VOLUME ["/data"]
EXPOSE 8788
# /version always answers (no board needed) and exercises the HTTP path
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.ANDON_RELAY_PORT||8788)+'/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["relay"]
