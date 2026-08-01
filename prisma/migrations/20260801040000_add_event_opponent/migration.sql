-- AlterTable
-- 对手字段（创建赛事时必填，展示时拼接为「赛事名称-赛事性质-对手-时间」）
ALTER TABLE "Event" ADD COLUMN "opponent" TEXT;
