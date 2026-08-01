// 全局常量与工具函数（同构模块：会被 client 组件引用，禁止引入 node 内置模块）
export const NAME_PREFIX = "MMR丨";

// 拼接完整用户名
export function buildUsername(nickname: string): string {
  return `${NAME_PREFIX}${nickname}`;
}

// 时间格式化：YYYY-MM-DD HH:mm
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 计算赛事所需队伍数量：teamCount * 4 >= required 且 teamCount * 4 - required < 4
export function calculateSquadCount(requiredCount: number): number {
  return Math.ceil(requiredCount / 4);
}

// 校验队伍数量规则
export function isValidSquadCount(requiredCount: number, squadCount: number): boolean {
  const total = squadCount * 4;
  return total >= requiredCount && total - requiredCount < 4;
}

// 生成赛事主体标题：名称 - 性质 - 对手 - 时间（无名称时省略名称段）
// 服务端生成标题时必须显式指定时区，否则 UTC 服务器上时间会偏差 8 小时
export function buildEventTitle(parts: {
  displayName?: string;
  natureName: string;
  opponent?: string;
  eventTime: Date;
}): string {
  const timeStr = parts.eventTime.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return [parts.displayName, parts.natureName, parts.opponent, timeStr]
    .filter(Boolean)
    .join(" - ");
}
