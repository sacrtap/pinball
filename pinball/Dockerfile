# 「幻想兔」弹珠机预测系统 — 多阶段构建（deps / build / runtime 分层减体积）
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@8.15.3 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@8.15.3 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 迁移与 seed 在部署时执行（docker compose exec app pnpm prisma migrate deploy）
RUN pnpm build

FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@8.15.3 --activate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.* ./
COPY --from=builder /app/tsconfig.json ./
EXPOSE 3000
# 生产默认起 Next；worker service 用 command 覆盖为 ["pnpm","worker"]
CMD ["pnpm", "start"]
