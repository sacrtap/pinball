# 「幻想兔」弹珠机预测系统 — 多阶段构建（deps / build / runtime 分层减体积）
# 注意：必须使用基于 Debian 的镜像（而非 alpine），因为 argon2 原生模块的
# prebuild 针对 glibc 编译，在 alpine 的 musl 上会 SIGSEGV。
# deps 阶段安装 python3/make/g++ 供 argon2 编译，runtime 阶段不需要。
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN pnpm install --frozen-lockfile

FROM node:20-bookworm-slim AS builder
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 迁移与 seed 在部署时执行（docker compose exec app pnpm prisma migrate deploy）
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm build

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.* ./
COPY --from=builder /app/tsconfig.json ./
EXPOSE 3000
# 生产默认起 Next；worker service 用 command 覆盖为 ["pnpm","worker"]
# 容器内固定 3000，宿主端口由 docker-compose 的 ports 映射（当前 8477:3000）
CMD ["pnpm", "start"]
