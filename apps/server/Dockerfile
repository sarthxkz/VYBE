# API image. Build context is the repo root (npm workspace lockfile lives there).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/prisma.config.ts apps/server/
COPY apps/server/prisma apps/server/prisma
RUN npm ci --no-audit --no-fund
COPY apps/server apps/server
RUN npm run build -w apps/server

# Separate pruned copy so the runtime image carries no dev tools (prisma CLI stays in `build`, used for migrations).
FROM build AS prod
RUN npm prune --omit=dev && rm -rf apps/server/src apps/server/test

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 MEDIA_DIR=/data/media
WORKDIR /app/apps/server
COPY --from=prod /app /app
RUN install -d -o node -g node -m 700 /data/media
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]
