import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { getSiteSettings, buildUsername } from "@/lib/site-settings";
import bcrypt from "bcryptjs";

async function validateTagIds(
  tx: Prisma.TransactionClient,
  model: "ability" | "duty" | "operator",
  ids: string[]
): Promise<string[]> {
  const uniqueIds = [...new Set(ids)];
  let count = 0;
  if (model === "ability") {
    count = await tx.ability.count({ where: { id: { in: uniqueIds }, disabled: false } });
  } else if (model === "duty") {
    count = await tx.duty.count({ where: { id: { in: uniqueIds }, disabled: false } });
  } else {
    count = await tx.operator.count({ where: { id: { in: uniqueIds }, disabled: false } });
  }
  if (count !== uniqueIds.length) throw new Error("包含无效或已禁用的标签");
  return uniqueIds;
}

// 获取当前用户信息
export const GET = withErrorHandler(async () => {
  const user = await requireUser();
  const [detail, settings] = await Promise.all([
    prisma.user.findUnique({
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
    }),
    getSiteSettings(),
  ]);
  if (!detail) return fail("用户不存在", 404);

  return ok({
    id: detail.id,
    username: detail.username,
    nickname: detail.nickname,
    role: detail.role,
    createdAt: detail.createdAt,
    // 战队前缀（昵称编辑时的输入框前缀展示与 session 用户名同步用）
    teamPrefix: settings.teamPrefix,
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

  // 事务内的校验错误以 throw 抛出，由外层 catch 统一转为 fail 响应
  // （事务回调内的 return fail() 只会退出回调，不会中止 handler，导致校验被跳过）
  const { teamPrefix } = await getSiteSettings();
  try {
    await prisma.$transaction(async (tx) => {
      // 修改昵称（同时更新用户名）
      if (nickname !== undefined) {
        const trimmed = String(nickname).trim();
        if (!trimmed) throw new Error("昵称不能为空");
        if (teamPrefix && trimmed.startsWith(teamPrefix)) {
          throw new Error(`昵称无需包含「${teamPrefix}」前缀`);
        }
        const newUsername = buildUsername(trimmed, teamPrefix);
        if (newUsername !== user.name) {
          const existing = await tx.user.findUnique({ where: { username: newUsername } });
          if (existing && existing.id !== user.id) throw new Error("该昵称已被使用");
        }
        await tx.user.update({
          where: { id: user.id },
          data: { nickname: trimmed, username: newUsername },
        });
      }

      // 修改密码
      if (password !== undefined && password !== null && password !== "") {
        if (String(password).length < 6) throw new Error("密码至少 6 位");
        const passwordHash = await bcrypt.hash(String(password), 10);
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash },
        });
      }

      // 更新能力
      if (abilityIds !== undefined) {
        const validAbilityIds = await validateTagIds(tx, "ability", abilityIds);
        await tx.userAbility.deleteMany({ where: { userId: user.id } });
        if (validAbilityIds.length > 0) {
          await tx.userAbility.createMany({
            data: validAbilityIds.map((abilityId: string) => ({ userId: user.id, abilityId })),
          });
        }
      }

      // 更新职责
      if (dutyIds !== undefined) {
        const validDutyIds = await validateTagIds(tx, "duty", dutyIds);
        await tx.userDuty.deleteMany({ where: { userId: user.id } });
        if (validDutyIds.length > 0) {
          await tx.userDuty.createMany({
            data: validDutyIds.map((dutyId: string) => ({ userId: user.id, dutyId })),
          });
        }
      }

      // 更新干员
      if (operatorIds !== undefined) {
        const validOperatorIds = await validateTagIds(tx, "operator", operatorIds);
        await tx.userOperator.deleteMany({ where: { userId: user.id } });
        if (validOperatorIds.length > 0) {
          await tx.userOperator.createMany({
            data: validOperatorIds.map((operatorId: string) => ({
              userId: user.id,
              operatorId,
            })),
          });
        }
      }
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // 已知的校验错误 → 400（前缀提示为动态文案，按前缀匹配）
    if (VALIDATION_ERRORS.has(msg) || msg.startsWith("昵称无需包含")) return fail(msg);
    throw e; // 未知错误交由 withErrorHandler 处理
  }

  return ok({ success: true });
});

const VALIDATION_ERRORS = new Set([
  "昵称不能为空",
  "该昵称已被使用",
  "密码至少 6 位",
  "包含无效或已禁用的标签",
]);
