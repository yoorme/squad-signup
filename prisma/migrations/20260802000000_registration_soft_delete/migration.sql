-- 报名软删除改造：
-- 1. 删除旧的 (eventId, userId, status) 复合唯一索引
--    （软删除后同一用户会累积多条 CANCELLED 记录，旧约束会误伤）
-- 2. 新建部分唯一索引：仅对 REGISTERED 记录保证 (eventId, userId) 唯一
--    （"同一用户同一赛事最多一条有效报名"的数据库级兜底，防止并发重复报名）

DROP INDEX IF EXISTS "Registration_eventId_userId_status_key";

CREATE UNIQUE INDEX "Registration_one_active_per_event"
ON "Registration"("eventId", "userId")
WHERE "status" = 'REGISTERED'::"RegStatus";
