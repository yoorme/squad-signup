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

# 安装运行时需要的 CLI 工具（锁定精确版本，与 package.json 保持一致，避免上游变更破坏构建）
RUN npm i -g tsx@4.23.1 prisma@6.19.3

# bcryptjs 用于 docker-entrypoint.sh 中 seed 脚本的密码加密
# （standalone 模式不打包非追踪依赖，需在运行阶段单独安装）
RUN npm i bcryptjs@3.0.3

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

# 上传文件持久目录（compose 挂载 uploads 卷；独立于应用代码目录）
RUN mkdir -p /app/uploads

# 以非 root 用户运行，降低容器逃逸风险
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs \
  && mkdir -p /home/nextjs \
  && chown -R nextjs:nodejs /app /home/nextjs
ENV HOME=/home/nextjs
USER nextjs

EXPOSE 3000

CMD ["/docker-entrypoint.sh"]
