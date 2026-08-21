import { prisma } from "@/lib/prisma";

// ============ 站点设置（战队管理）服务端模块 ============
// 仅限服务端使用（引入了 prisma）；客户端需要的展示值由服务端组件取好后以 props 传递

// 兜底默认值（设置行不存在时生效，正常情况下不会走到）：
// 前缀为空 —— authorize 会把用户输入原样作为用户名查询，登录不受影响。
// 存量老库的前缀由迁移 20260821000000_add_site_setting 的回填 SQL
// 从历史用户名（用户名 = 前缀 + 昵称）自动推导写入，不依赖此硬编码。
export const LEGACY_DEFAULT_PREFIX = "";

export interface SiteSettings {
  teamPrefix: string;
  iconName: string | null;
  iconUpdatedAt: Date | null;
}

// 读取站点设置。任何异常（表不存在、数据库不可达等）都降级为默认值，
// 保证构建期/异常环境下页面与 favicon 路由仍可渲染。
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { id: "global" } });
    if (row) {
      return {
        teamPrefix: row.teamPrefix,
        iconName: row.iconName,
        iconUpdatedAt: row.iconUpdatedAt,
      };
    }
  } catch {
    // 降级：返回旧版默认
  }
  return {
    teamPrefix: LEGACY_DEFAULT_PREFIX,
    iconName: null,
    iconUpdatedAt: null,
  };
}

// 拼接完整用户名（前缀 + 昵称）
export function buildUsername(nickname: string, teamPrefix: string): string {
  return `${teamPrefix}${nickname}`;
}
