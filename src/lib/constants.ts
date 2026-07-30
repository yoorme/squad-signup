// 全局常量与工具函数
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

// 生成随机邀请码
export function generateInvitationCode(length: number = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
