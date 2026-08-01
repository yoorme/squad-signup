import { PrismaClient, Role, AbilityCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 1. 初始管理员
  const adminUsername = process.env.INITIAL_ADMIN_USERNAME ?? "MMR丨Admin";
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? "admin123456";

  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        username: adminUsername,
        nickname: adminUsername.replace(/^MMR丨/, ""),
        passwordHash,
        role: Role.ADMIN,
      },
    });
    console.log(`✓ 初始管理员已创建: ${adminUsername} / ${adminPassword}`);
  } else {
    console.log(`✓ 管理员已存在: ${adminUsername}`);
  }

  // 2. 能力 - 步兵方向
  const infantryAbilities = ["突击", "医疗", "侦查", "正面", "机动", "狙击", "反载"];
  for (let i = 0; i < infantryAbilities.length; i++) {
    await prisma.ability.upsert({
      where: { name_category: { name: infantryAbilities[i], category: AbilityCategory.INFANTRY } },
      update: {},
      create: {
        name: infantryAbilities[i],
        category: AbilityCategory.INFANTRY,
        sortOrder: i,
      },
    });
  }

  // 3. 能力 - 载具方向
  const vehicleAbilities = ["驾驶", "焊工", "骇车工"];
  for (let i = 0; i < vehicleAbilities.length; i++) {
    await prisma.ability.upsert({
      where: { name_category: { name: vehicleAbilities[i], category: AbilityCategory.VEHICLE } },
      update: {},
      create: {
        name: vehicleAbilities[i],
        category: AbilityCategory.VEHICLE,
        sortOrder: i,
      },
    });
  }

  // 4. 职责
  const duties = ["队长", "指挥", "无"];
  for (let i = 0; i < duties.length; i++) {
    await prisma.duty.upsert({
      where: { name: duties[i] },
      update: {},
      create: { name: duties[i], sortOrder: i },
    });
  }

  // 5. 赛事性质
  const natures = ["正赛", "训练赛", "娱乐赛", "其他"];
  for (let i = 0; i < natures.length; i++) {
    await prisma.eventNature.upsert({
      where: { name: natures[i] },
      update: {},
      create: { name: natures[i], sortOrder: i },
    });
  }

  // 6. 赛事名称
  await prisma.eventName.upsert({
    where: { name: "百姓杯" },
    update: {},
    create: { name: "百姓杯", sortOrder: 0 },
  });

  // 7. 分队性质
  const squadNatures = ["步兵", "载具", "机动", "指挥"];
  for (let i = 0; i < squadNatures.length; i++) {
    await prisma.squadNature.upsert({
      where: { name: squadNatures[i] },
      update: {},
      create: { name: squadNatures[i], sortOrder: i },
    });
  }

  // 8. 赛事地图（三角洲行动默认地图）
  const maps = ["攀升", "烬区", "风暴眼", "临界点", "堑壕战", "断层", "断轨"];
  for (let i = 0; i < maps.length; i++) {
    await prisma.eventMap.upsert({
      where: { name: maps[i] },
      update: {},
      create: { name: maps[i], sortOrder: i },
    });
  }

  // 9. 干员名单（三角洲行动）
  const operators = [
    "红狼", "薰", "蔓属", "骇爪", "深紫", "露娜", "乌鸦", "月辉",
    "焰影", "虞蛇", "佐娅", "蜂医", "霸王", "狱焰", "刃影", "猎隼",
    "深渊", "凯", "威龙", "红郎", "缪煞", "九曲",
  ];
  for (let i = 0; i < operators.length; i++) {
    await prisma.operator.upsert({
      where: { name: operators[i] },
      update: {},
      create: { name: operators[i], sortOrder: i },
    });
  }

  console.log("✓ 种子数据初始化完成");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
