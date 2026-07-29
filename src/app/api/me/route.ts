import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { buildUsername } from "@/lib/constants";
import bcrypt from "bcryptjs";

// 获取当前用户信息
export const GET = withErrorHandler(async () => {
  const user = await requireUser();
  const detail = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      nickname: true,
      role: true,
      createdAt: true,
      abilities: { include: { ability: true } },
      duties: { include: { duty: true } },
      operators: { include: { operator: true } },
    },
  });
  if (!detail) return fail("用户不存在", 404);

  return ok({
    id: detail.id,
    username: detail.username,
    nickname: detail.nickname,
    role: detail.role,
    createdAt: detail.createdAt,
    abilities: detail.abilities.map((ua) => ua.ability),
    duties: detail.duties.map((ud) => ud.duty),
    operators: detail.operators.map((uo) => uo.operator),
  });
});

// 更新个人信息
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const { nickname, password, abilityIds, dutyIds, operatorIds } = body as {
    nickname?: string;
    password?: string;
    abilityIds?: string[];
    dutyIds?: string[];
    operatorIds?: string[];
  };

  await prisma.$transaction(async (tx) => {
    // 修改昵称（同时更新用户名）
    if (nickname !== undefined) {
      const trimmed = String(nickname).trim();
      if (!trimmed) return fail("昵称不能为空");
      if (trimmed.startsWith("MMR丨")) return fail("昵称无需包含 MMR丨 前缀");
      const newUsername = buildUsername(trimmed);
      if (newUsername !== user.name) {
        const existing = await tx.user.findUnique({ where: { username: newUsername } });
        if (existing && existing.id !== user.id) return fail("该昵称已被使用");
      }
      await tx.user.update({
        where: { id: user.id },
        data: { nickname: trimmed, username: newUsername },
      });
    }

    // 修改密码
    if (password !== undefined && password !== null && password !== "") {
      if (String(password).length < 6) return fail("密码至少 6 位");
      const passwordHash = await bcrypt.hash(String(password), 10);
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
    }

    // 更新能力
    if (abilityIds !== undefined) {
      await tx.userAbility.deleteMany({ where: { userId: user.id } });
      if (abilityIds.length > 0) {
        await tx.userAbility.createMany({
          data: abilityIds.map((abilityId: string) => ({ userId: user.id, abilityId })),
        });
      }
    }

    // 更新职责
    if (dutyIds !== undefined) {
      await tx.userDuty.deleteMany({ where: { userId: user.id } });
      if (dutyIds.length > 0) {
        await tx.userDuty.createMany({
          data: dutyIds.map((dutyId: string) => ({ userId: user.id, dutyId })),
        });
      }
    }

    // 更新干员
    if (operatorIds !== undefined) {
      await tx.userOperator.deleteMany({ where: { userId: user.id } });
      if (operatorIds.length > 0) {
        await tx.userOperator.createMany({
          data: operatorIds.map((operatorId: string) => ({
            userId: user.id,
            operatorId,
          })),
        });
      }
    }
  });

  return ok({ success: true });
});
