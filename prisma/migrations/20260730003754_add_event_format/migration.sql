-- 增加赛事赛制字段
-- 先创建枚举类型，再添加列
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventFormat') THEN
    CREATE TYPE "EventFormat" AS ENUM ('BO3', 'BO5', 'R2');
  END IF;
END$$;

-- 添加 format 列（可为空，null 表示未知/不展示）
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "format" "EventFormat";
