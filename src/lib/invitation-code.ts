// 邀请码生成（仅服务端使用——依赖 node:crypto，勿被 client 组件引用）
import { randomInt } from "crypto";

// 生成随机邀请码（使用加密安全随机数，不可预测）
export function generateInvitationCode(length: number = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(chars.length));
  }
  return result;
}
