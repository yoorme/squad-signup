# ============ 阶段 1：依赖安装 ============
FROM node:20-alpine AS deps
WORKDIR /app

# 仅复制 package 文件，利用 Docker 层缓存
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# 安装全部依赖（含 devDependencies，构建需要 tsx/typescript）
RUN npm ci

# 生成 Prisma Client
RUN npx prisma generate

# ============ 阶段 2：构建 ============
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建时仅执行 next build（数据库迁移在容器启动时执行）
# 使用 webpack 模式（Turbopack 在某些环境有 root 解析问题）
RUN npx next build --webpack

# ============ 阶段 3：运行时 ============
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 安装运行时需要的 CLI 工具
RUN npm i -g tsx prisma

# 仅复制运行时所需文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
# Prisma Client（standalone 模式不自动包含）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 启动脚本：先迁移+种子，再启动 Next.js
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

CMD ["/docker-entrypoint.sh"]
