import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { calculateSquadCount, isValidSquadCount } from "@/lib/constants";

// 获取赛事列表
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = req.nextUrl;
  const status = url.searchParams.get("status") || "UPCOMING"; // UPCOMING | ARCHIVED | ALL

  const where = status === "ALL" ? {} : { status: status as "UPCOMING" | "ARCHIVED" };

  const events = await prisma.event.findMany({
    where,
    orderBy: { eventTime: "desc" },
    include: {
      nature: true,
      name: true,
      squads: {
        orderBy: { index: "asc" },
        include: {
          nature: true,
          registrations: {
            where: { status: "REGISTERED" },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                  abilities: { include: { ability: true } },
                  duties: { include: { duty: true } },
                },
              },
            },
          },
        },
      },
      registrations: {
        where: { status: "REGISTERED", squadId: null },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              abilities: { include: { ability: true } },
              duties: { include: { duty: true } },
            },
          },
        },
      },
    },
  });

  // 计算我的报名状态
  const myRegistrations = await prisma.registration.findMany({
    where: { userId: user.id, status: "REGISTERED" },
    select: { eventId: true, squadId: true, isSubstitute: true },
  });
  const myRegMap = new Map(myRegistrations.map((r) => [r.eventId, r]));

  return ok(
    events.map((e) => {
      // 计算赛事报名状态版本号：基于所有报名记录的 id+squadId+createdAt 拼接的哈希
      // 任何报名的增删、队员在分队/替补间的移动都会让版本变化
      // 前端据此检测后台轮询拉到的数据是否有变化，决定是否提示"数据已同步"
      const allRegs = [
        ...e.squads.flatMap((s) => s.registrations),
        ...e.registrations,
      ];
      const version = allRegs
        .map((r) => `${r.id}:${r.squadId ?? "sub"}:${r.createdAt.getTime()}`)
        .sort()
        .join("|");

      return {
        id: e.id,
        title: e.title,
        eventTime: e.eventTime,
        status: e.status,
        requiredCount: e.requiredCount,
        nature: e.nature,
        name: e.name,
        createdAt: e.createdAt,
        version,
        squads: e.squads.map((s) => ({
          id: s.id,
          index: s.index,
          capacity: s.capacity,
          nature: s.nature,
          registeredCount: s.registrations.length,
          members: s.registrations.map((r) => ({
            registrationId: r.id,
            userId: r.user.id,
            username: r.user.username,
            nickname: r.user.nickname,
            abilities: r.user.abilities.map((ua) => ua.ability),
            duties: r.user.duties.map((ud) => ud.duty),
          })),
        })),
        substitutes: e.registrations.map((r) => ({
          registrationId: r.id,
          userId: r.user.id,
          username: r.user.username,
          nickname: r.user.nickname,
          abilities: r.user.abilities.map((ua) => ua.ability),
          duties: r.user.duties.map((ud) => ud.duty),
        })),
        totalRegistered: e.squads.reduce((sum, s) => sum + s.registrations.length, 0),
        totalSubstitutes: e.registrations.length,
        myRegistration: myRegMap.get(e.id) || null,
      };
    })
  );
});

// 创建赛事（管理员）
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireAdmin();
  const body = await req.json();
  const { eventTime, natureId, nameId, requiredCount, squadNatures } = body as {
    eventTime: string;
    natureId: string;
    nameId: string;
    requiredCount: number;
    squadNatures: string[]; // 每支队伍的性质 ID 列表
  };

  if (!eventTime || !natureId || !nameId || !requiredCount) {
    return fail("请填写完整信息");
  }
  const required = Number(requiredCount);
  if (!Number.isInteger(required) || required <= 0) {
    return fail("要求人数必须是正整数");
  }
  const teamCount = calculateSquadCount(required);
  if (!squadNatures || squadNatures.length !== teamCount) {
    return fail(`分队数量必须为 ${teamCount}（满足 ${teamCount}*4 >= ${required} 且差值 < 4）`);
  }
  if (!isValidSquadCount(required, teamCount)) {
    return fail("分队数量不满足规则");
  }

  // 校验标签存在
  const [nature, name] = await Promise.all([
    prisma.eventNature.findUnique({ where: { id: natureId } }),
    prisma.eventName.findUnique({ where: { id: nameId } }),
  ]);
  if (!nature) return fail("赛事性质不存在");
  if (!name) return fail("赛事名称不存在");

  const eventDate = new Date(eventTime);
  if (isNaN(eventDate.getTime())) return fail("时间格式错误");

  const title = `${name.name} - ${nature.name} - ${eventDate.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;

  const event = await prisma.$transaction(async (tx) => {
    const ev = await tx.event.create({
      data: {
        title,
        eventTime: eventDate,
        natureId,
        nameId,
        requiredCount: required,
        createdById: user.id,
      },
    });

    // 创建分队
    for (let i = 0; i < teamCount; i++) {
      await tx.squad.create({
        data: {
          eventId: ev.id,
          natureId: squadNatures[i],
          index: i + 1,
          capacity: 4,
        },
      });
    }

    return ev;
  });

  return ok({ id: event.id });
});
