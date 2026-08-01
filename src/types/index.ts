// 共享前端类型定义（与 API 响应结构对应）
// 各页面/组件统一从此处引用，避免在多个文件重复声明

// ============ 字典/标签 ============

export interface Ability {
  id: string;
  name: string;
  category: "INFANTRY" | "VEHICLE";
  sortOrder?: number;
  disabled?: boolean;
}

export interface Duty {
  id: string;
  name: string;
  sortOrder?: number;
  disabled?: boolean;
}

export interface Operator {
  id: string;
  name: string;
  faction?: string | null;
  sortOrder?: number;
  disabled?: boolean;
}

export interface TagItem {
  id: string;
  name: string;
  sortOrder?: number;
  disabled?: boolean;
}

// 标签类型（与 /api/admin/tags 的 type 参数对应）
export type TagType =
  | "ability"
  | "duty"
  | "operator"
  | "nature"
  | "name"
  | "squadNature"
  | "map";

// 管理后台使用的标签完整字段（含使用计数与分类/阵营）
export interface AdminTagItem extends TagItem {
  category?: "INFANTRY" | "VEHICLE";
  faction?: string | null;
  sortOrder: number;
  usedCount: number;
}

// ============ 队员 ============

export interface Member {
  id: string;
  username: string;
  nickname: string;
  abilities: Ability[];
  duties: Duty[];
  operators?: Operator[];
}

// 赛事详情中的报名成员（含报名记录 ID）
export interface EventMember extends Member {
  registrationId: string;
  userId: string;
}

// ============ 赛事 ============

// 列表场景的分队（仅计数）
export interface SquadInfo {
  id: string;
  index: number;
  capacity: number;
  nature: TagItem;
  registeredCount: number;
}

// 详情场景的分队（含成员列表）
export interface SquadDetail extends SquadInfo {
  members: EventMember[];
}

export interface MyRegistration {
  squadId: string | null;
  isSubstitute: boolean;
}

export interface EventSummary {
  id: string;
  title: string;
  eventTime: string;
  status: "UPCOMING" | "ARCHIVED";
  requiredCount: number;
  format: "BO3" | "BO5" | "R2" | null;
  nature: TagItem;
  name: TagItem | null;
  customName: string | null;
  opponent: string | null;
  map: TagItem | null;
  createdAt: string;
  isRead?: boolean;
  squads: SquadInfo[];
  totalRegistered: number;
  totalSubstitutes: number;
  myRegistration: MyRegistration | null;
}

export type EventDetail = Omit<EventSummary, "squads"> & {
  squads: SquadDetail[];
  substitutes: EventMember[];
  version?: string;
};

// /api/events/manage PATCH 的更新载荷（undefined=不修改，null=清空）
export interface EventManagePatch {
  status?: "UPCOMING" | "ARCHIVED";
  natureId?: string;
  nameId?: string | null;
  customName?: string | null;
  mapId?: string | null;
  opponent?: string | null;
  format?: "BO3" | "BO5" | "R2" | null;
  squads?: { id: string; natureId: string }[];
}

// ============ 公告 ============

export interface AnnouncementImage {
  id: string;
  path: string;
  sortOrder: number;
}

export interface AnnouncementSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  author?: { username: string; nickname: string };
  isRead?: boolean;
  confirmed?: boolean;
  commentCount?: number;
}

// ============ API 响应包裹 ============

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
