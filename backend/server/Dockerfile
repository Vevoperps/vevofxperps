# The vevo server, for Railway. Build context is backend/ (not this folder),
# because it reads shared/markets.json — the one market table.
FROM node:22-slim AS build

WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/server/dist ./dist
COPY shared /app/shared

# Railway injects the environment.
CMD ["node", "dist/index.js"]
