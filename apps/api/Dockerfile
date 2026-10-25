FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter @booking/api exec prisma generate
RUN pnpm --filter @booking/api build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY --from=build /app /app

EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @booking/api exec prisma migrate deploy && node apps/api/dist/main.js"]
