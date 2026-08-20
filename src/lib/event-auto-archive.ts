import { prisma } from "@/lib/prisma";

// 赛事过期自动归档（懒更新）
//
// 背景：此前赛事过了开始时间后 status 仍为 UPCOMING，
// 永远停留在"即将进行"列表，且"已结束"里看不到任何历史赛事，
// 只有管理员手动归档才会流转。
//
// 策略：在赛事查询入口（列表/详情）先执行一次批量更新，
// 把 eventTime 已过的 UPCOMING 赛事标记为 ARCHIVED。
// - 无匹配行时 updateMany 仅做索引扫描，开销可忽略
// - 管理员仍可手动"恢复"为即将进行（用于错误归档/改期场景），
//   恢复后应同时修改赛事时间，否则下次查询会再次自动归档
// 内存节流：30 秒内至多执行一次，避免每次赛事查询都发起 updateMany
// （单进程 systemd 部署下有效；无过期赛事时 updateMany 本身开销极小，节流进一步省去）
const THROTTLE_MS = 30_000;
const globalForThrottle = globalThis as unknown as { __autoArchiveLastRun?: number };

export async function autoArchiveExpiredEvents(): Promise<number> {
  const last = globalForThrottle.__autoArchiveLastRun ?? 0;
  if (Date.now() - last < THROTTLE_MS) return 0;

  try {
    const result = await prisma.event.updateMany({
      where: { status: "UPCOMING", eventTime: { lt: new Date() } },
      data: { status: "ARCHIVED" },
    });
    globalForThrottle.__autoArchiveLastRun = Date.now();
    return result.count;
  } catch (e) {
    // 自动归档失败不应阻塞查询，仅记录日志
    console.error("[autoArchive] failed:", e);
    return 0;
  }
}
