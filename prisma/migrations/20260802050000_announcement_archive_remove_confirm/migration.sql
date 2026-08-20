-- 公告归档功能 + 移除确认已阅逻辑
-- 1. Announcement 增加 isArchived/archivedAt（归档后仅管理员可见）
-- 2. AnnouncementRead 删除 confirmedAt（确认已阅逻辑完全移除，阅读记录仅用于红点）

ALTER TABLE "Announcement" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Announcement" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "AnnouncementRead" DROP COLUMN "confirmedAt";
