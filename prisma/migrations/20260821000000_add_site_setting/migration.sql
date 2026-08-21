-- 战队管理：全局站点设置（单行表，id 固定为 "global"）
-- teamPrefix: 战队名称前缀，空 = 无前缀
-- iconName:   自定义战队图标（UPLOAD_DIR 内文件名），null = 默认图标
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL,
    "teamPrefix" TEXT NOT NULL DEFAULT '',
    "iconName" TEXT,
    "iconUpdatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- 存量部署回填：老版本用户名 = 前缀 + 昵称（如「XX丨张三」/「张三」），
-- 用「用户名去掉尾部昵称」推导出历史上生效的前缀，写入全局设置行。
-- 所有用户推导结果一致时采用该前缀（保持更新后站点显示与登录习惯不变）；
-- 不一致或无用户时不落行（新部署由 seed 按 TEAM_PREFIX 初始化，默认无前缀）。
INSERT INTO "SiteSetting" ("id", "teamPrefix", "updatedAt")
SELECT 'global',
       CASE WHEN COUNT(DISTINCT p) = 1 THEN MIN(p) ELSE '' END,
       NOW()
FROM (
    SELECT LEFT("username", LENGTH("username") - LENGTH("nickname")) AS p
    FROM "User"
    WHERE LENGTH("username") >= LENGTH("nickname")
) derived
HAVING COUNT(*) > 0
   AND NOT EXISTS (SELECT 1 FROM "SiteSetting");
