# Aktivite Giriş — çok aşamalı build. Client (Vite) + Server (tsc) + Prisma generate,
# ardından ince runtime imajı. Server prod'da client/dist'i serve eder.
FROM node:20-bookworm AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm install --include=dev
COPY . .
# Prisma client'ı server tsc'den ÖNCE üret (aksi halde @prisma/client tipleri bulunamaz)
RUN cd server && npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
# Prisma query engine OpenSSL'e ihtiyaç duyar
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/_migrate_import.mjs ./server/_migrate_import.mjs
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
