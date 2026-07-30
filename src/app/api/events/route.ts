import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { calculateSquadCount, isValidSquadCount } from "@/lib/constants";

// 事件详情查询的完整 payload 类型（含 squads/registrations/user 关联）
type EventDetailPayload = Prisma.EventGetPayload<{
  include: {
    nature: true;
    name: true;
    squads: {
      orderBy: { index: "asc" };
      include: {
        nature: true;
        registrations: {
          where: { status: "REGISTERED" };
          include: {
            user: {
              select: {
                id: true;
                username: true;
                nickname: true;
                abilities: { include: { ability: true } };
                duties: { include: { duty: true } };
              };
            };
          };
        };
      };
    };
    registrations: {
      where: { status: "REGISTERED"; squadId: null };
      include: {
        user: {
          select: {
            id: true;
            username: true;
            nickname: true;
            abilities: { include: { ability: true } };
            duties: { include: { duty: true } };
          };
        };
      };
    };
  };
}>;

// 获取赛事列表
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = req.nextUrl;
  const status = url.searchParams.get("status") || "UPCOMING"; // UPCOMING | ARCHIVED | ALL
  const id = url.searchParams.get("id"); // 指定赛事 ID → 单个详情

  // 单个赛事详情：只查一条，避免拉全量
  if (id) {
    const e = await prisma.event.findUnique({
      where: { id },
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
    if (!e) return fail("赛事不存在", 404);

    const myReg = await prisma.registration.findFirst({
      where: { eventId: e.id, userId: user.id, status: "REGISTERED" },
      select: { squadId: true, isSubstitute: true },
    });

    // 标记已读（幂等），用于导航红点消除
    await prisma.eventRead
      .upsert({
        where: { userId_eventId: { userId: user.id, eventId: e.id } },
        create: { userId: user.id, eventId: e.id },
        update: {},
      })
      .catch(() => {});

    return ok(serializeEventDetail(e, myReg));
  }

  // 列表模式：精简字段（不拉 members 详情，仅返回计数）
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
          _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
        },
      },
      _count: {
        select: {
          registrations: { where: { status: "REGISTERED", squadId: null } },
        },
      },
    },
  });

  // 一次性查询我的所有报名（避免 N+1）
  const eventIds = events.map((e) => e.id);
  const myRegistrations = await prisma.registration.findMany({
    where: { userId: user.id, status: "REGISTERED", eventId: { in: eventIds } },
    select: { eventId: true, squadId: true, isSubstitute: true },
  });
  const myRegMap = new Map(myRegistrations.map((r) => [r.eventId, r]));

  // 一次性查询我的已读赛事（避免 N+1）
  const myReads = await prisma.eventRead.findMany({
    where: { userId: user.id, eventId: { in: eventIds } },
    select: { eventId: true },
  });
  const myReadSet = new Set(myReads.map((r) => r.eventId));

  return ok(
    events.map((e) => ({
      id: e.id,
      title: e.title,
      eventTime: e.eventTime,
      status: e.status,
      requiredCount: e.requiredCount,
      format: e.format,
      nature: e.nature,
      name: e.name,
      createdAt: e.createdAt,
      isRead: myReadSet.has(e.id),
      squads: e.squads.map((s) => ({
        id: s.id,
        index: s.index,
        capacity: s.capacity,
        nature: s.nature,
        registeredCount: s._count.registrations,
      })),
      totalRegistered: e.squads.reduce((sum, s) => sum + s._count.registrations, 0),
      totalSubstitutes: e._count.registrations,
      myRegistration: myRegMap.get(e.id) || null,
    }))
  );
});

// 序列化单个赛事详情（含 members + version）
function serializeEventDetail(
  e: EventDetailPayload,
  myReg: { squadId: string | null; isSubstitute: boolean } | null
) {
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
    format: e.format,
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
    myRegistration: myReg,
  };
}

// 创建赛事（管理员）
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireAdmin();
  const body = await req.json();
  const { eventTime, natureId, nameId, requiredCount, squadNatures, format } = body as {
    eventTime: string;
    natureId: string;
    nameId: string;
    requiredCount: number;
    squadNatures: string[]; // 每支队伍的性质 ID 列表
    format?: "BO3" | "BO5" | "R2" | null; // 赛制，null/undefined 表示未知
  };

  if (!eventTime || !natureId || !nameId || !requiredCount) {
    return fail("请填写完整信息");
  }
  const required = Number(requiredCount);
  if (!Number.isInteger(required) || required <= 0) {
    return fail("要求人数必须是正整数");
  }
  // 校验赛制取值
  const validFormats = ["BO3", "BO5", "R2"];
  const formatValue = format && validFormats.includes(format) ? format : null;
  const teamCount = calculateSquadCount(required);
  if (!squadNatures || squadNatures.length !== teamCount) {
    return fail(`分队数量必须为 ${teamCount}（满足 ${teamCount}*4 >= ${required} 且差值 < 4）`);
  }
  if (!isValidSquadCount(required, teamCount)) {
    return fail("分队数量不满足规则");
  }

  // 校验标签存在且未被禁用
  const [nature, name] = await Promise.all([
    prisma.eventNature.findUnique({ where: { id: natureId } }),
    prisma.eventName.findUnique({ where: { id: nameId } }),
  ]);
  if (!nature) return fail("赛事性质不存在");
  if (nature.disabled) return fail("赛事性质已被禁用，请选择其他标签");
  if (!name) return fail("赛事名称不存在");
  if (name.disabled) return fail("赛事名称已被禁用，请选择其他标签");

  // 校验分队性质存在且未被禁用
  const squadNatureIds = [...new Set(squadNatures)];
  const squadNatures_db = await prisma.squadNature.findMany({
    where: { id: { in: squadNatureIds } },
  });
  const squadNatureMap = new Map(squadNatures_db.map((s) => [s.id, s]));
  for (const snId of squadNatureIds) {
    const sn = squadNatureMap.get(snId);
    if (!sn) return fail("分队性质不存在");
    if (sn.disabled) return fail(`分队性质「${sn.name}」已被禁用，请选择其他标签`);
  }

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
        format: formatValue,
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
