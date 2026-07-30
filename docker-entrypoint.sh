#!/bin/sh
set -e

echo "==> 等待数据库就绪..."
# 等待几秒，确保 PostgreSQL 容器已启动（docker-compose depends_on 已做健康检查，此处额外保险）
sleep 3

echo "==> 执行数据库迁移..."
npx prisma migrate deploy

echo "==> 执行种子数据（幂等，重复执行不会重复创建）..."
npx tsx prisma/seed.ts

echo "==> 启动 Next.js 应用..."
exec node server.js
