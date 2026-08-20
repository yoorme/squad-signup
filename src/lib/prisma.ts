import { PrismaClient } from "@prisma/client";

// 全局单例：生产环境 Next.js 会把该模块打进多个 route 的独立 bundle，
// 若仅开发环境缓存，生产会为每个 bundle 各建一个 PrismaClient，
// 导致连接池与内存成倍膨胀（PostgreSQL 连接数上限易被打爆）。
// 始终缓存到 globalThis，保证单进程内只有一个连接池。
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
  });

globalForPrisma.prisma = prisma;
