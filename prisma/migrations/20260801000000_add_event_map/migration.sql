-- 1. 新增赛事地图标签表
CREATE TABLE IF NOT EXISTS "EventMap" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EventMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventMap_name_key" ON "EventMap"("name");

-- 2. Event 表新增 mapId 字段（可选，未选择时为 null）
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "mapId" TEXT;

-- 3. 外键关系：Event.mapId → EventMap.id
-- 设置 ON DELETE SET NULL：删除地图标签后赛事的 mapId 自动置空，不阻塞删除
ALTER TABLE "Event"
  ADD CONSTRAINT "Event_mapId_fkey"
  FOREIGN KEY ("mapId") REFERENCES "EventMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
