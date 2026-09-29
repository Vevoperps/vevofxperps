# The Solana keeper, for Railway. Build context is backend/ (not this folder),
# because the image needs shared/ — the market table and the program client.
FROM node:22-slim AS build

WORKDIR /app/keeper-solana
COPY keeper-solana/package*.json ./
RUN npm install --no-audit --no-fund

COPY shared /app/shared
COPY keeper-solana/tsconfig.json ./
COPY keeper-solana/scripts ./scripts
COPY keeper-solana/src ./src
RUN npm run build

FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/keeper-solana

COPY keeper-solana/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/keeper-solana/dist ./dist
COPY shared /app/shared

# Railway injects the environment, so there is no --env-file here.
CMD ["node", "dist/index.js"]
