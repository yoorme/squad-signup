-- 1. Event.nameId 改为可空：null 表示"未知"（不展示赛事名称，主体字仅显示赛事性质）
ALTER TABLE "Event" ALTER COLUMN "nameId" DROP NOT NULL;

-- 2. 新增 customName 字段：管理员选"其他"时输入的自定义临时名称（最少 1 字符）
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "customName" TEXT;
