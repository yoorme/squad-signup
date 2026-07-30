-- 1. 标签表增加 disabled 字段（默认 false，已有标签不受影响）
ALTER TABLE "Ability" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Duty" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Operator" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventNature" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventName" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SquadNature" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;

-- 2. 新增赛事已读记录表（用于导航红点：用户查看过赛事详情后标记）
CREATE TABLE IF NOT EXISTS "EventRead" (
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRead_pkey" PRIMARY KEY ("userId", "eventId")
);

-- 外键关系
ALTER TABLE "EventRead"
  ADD CONSTRAINT "EventRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventRead"
  ADD CONSTRAINT "EventRead_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 索引：按用户查询已读赛事
CREATE INDEX IF NOT EXISTS "EventRead_userId_idx" ON "EventRead"("userId");
CREATE INDEX IF NOT EXISTS "EventRead_eventId_idx" ON "EventRead"("eventId");
