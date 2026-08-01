#!/bin/sh
set -e

echo "==> 等待数据库就绪..."
# 主动探测 DATABASE_URL 主机的 TCP 连通性（最多 60 秒），替代固定 sleep：
# 数据库慢启动时不会抢跑迁移，快启动时也不白等
node -e '
const net = require("net");
let url;
try {
  url = new URL(process.env.DATABASE_URL || "");
} catch {
  console.error("DATABASE_URL 未设置或格式错误，跳过等待");
  process.exit(0);
}
const host = url.hostname;
const port = Number(url.port || 5432);
const deadline = Date.now() + 60000;
function tryConnect() {
  const sock = net.connect(port, host);
  sock.once("connect", () => { sock.end(); console.log("==> 数据库已就绪"); process.exit(0); });
  sock.once("error", () => {
    if (Date.now() > deadline) { console.error("✗ 等待数据库超时"); process.exit(1); }
    setTimeout(tryConnect, 2000);
  });
}
tryConnect();
'

echo "==> 执行数据库迁移..."
npx prisma migrate deploy

echo "==> 执行种子数据（幂等，重复执行不会重复创建）..."
npx tsx prisma/seed.ts

echo "==> 启动 Next.js 应用..."
exec node server.js
