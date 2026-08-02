import { PrismaClient, Role, AbilityCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 重要：seed 只在表为空时插入初始数据，避免复活管理员已删除的数据
  // 首次安装时表为空 → 正常插入
  // 更新时表非空 → 整个表跳过（管理员删除的干员/标签不会被复活）

  // 1. 初始管理员（仅当系统中没有任何管理员时才创建）
  const adminUsername = process.env.INITIAL_ADMIN_USERNAME ?? "MMR丨Admin";
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? "admin123456";

  const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
  if (adminCount === 0) {
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
    console.log(`✓ 管理员已存在（${adminCount} 个），跳过创建`);
  }

  // 2. 能力 - 步兵方向（表非空则跳过，避免复活已删除项）
  const infantryCount = await prisma.ability.count({ where: { category: AbilityCategory.INFANTRY } });
  if (infantryCount === 0) {
    const infantryAbilities = ["突击", "医疗", "侦查", "正面", "机动", "狙击", "反载"];
    for (let i = 0; i < infantryAbilities.length; i++) {
      await prisma.ability.create({
        data: { name: infantryAbilities[i], category: AbilityCategory.INFANTRY, sortOrder: i },
      });
    }
    console.log("✓ 步兵能力已初始化");
  } else {
    console.log(`✓ 步兵能力已存在（${infantryCount} 个），跳过`);
  }

  // 3. 能力 - 载具方向
  const vehicleCount = await prisma.ability.count({ where: { category: AbilityCategory.VEHICLE } });
  if (vehicleCount === 0) {
    const vehicleAbilities = ["驾驶", "焊工", "骇车"];
    for (let i = 0; i < vehicleAbilities.length; i++) {
      await prisma.ability.create({
        data: { name: vehicleAbilities[i], category: AbilityCategory.VEHICLE, sortOrder: i },
      });
    }
    console.log("✓ 载具能力已初始化");
  } else {
    console.log(`✓ 载具能力已存在（${vehicleCount} 个），跳过`);
  }

  // 4. 职责
  const dutyCount = await prisma.duty.count();
  if (dutyCount === 0) {
    const duties = ["队长", "指挥", "无"];
    for (let i = 0; i < duties.length; i++) {
      await prisma.duty.create({ data: { name: duties[i], sortOrder: i } });
    }
    console.log("✓ 职责已初始化");
  } else {
    console.log(`✓ 职责已存在（${dutyCount} 个），跳过`);
  }

  // 5. 赛事性质
  const natureCount = await prisma.eventNature.count();
  if (natureCount === 0) {
    const natures = ["正赛", "训练赛", "娱乐赛", "其他"];
    for (let i = 0; i < natures.length; i++) {
      await prisma.eventNature.create({ data: { name: natures[i], sortOrder: i } });
    }
    console.log("✓ 赛事性质已初始化");
  } else {
    console.log(`✓ 赛事性质已存在（${natureCount} 个），跳过`);
  }

  // 6. 赛事名称
  const eventNameCount = await prisma.eventName.count();
  if (eventNameCount === 0) {
    await prisma.eventName.create({ data: { name: "百姓杯", sortOrder: 0 } });
    console.log("✓ 赛事名称已初始化");
  } else {
    console.log(`✓ 赛事名称已存在（${eventNameCount} 个），跳过`);
  }

  // 7. 分队性质
  const squadNatureCount = await prisma.squadNature.count();
  if (squadNatureCount === 0) {
    const squadNatures = ["步兵", "载具", "机动", "指挥"];
    for (let i = 0; i < squadNatures.length; i++) {
      await prisma.squadNature.create({ data: { name: squadNatures[i], sortOrder: i } });
    }
    console.log("✓ 分队性质已初始化");
  } else {
    console.log(`✓ 分队性质已存在（${squadNatureCount} 个），跳过`);
  }

  // 8. 赛事地图（三角洲行动默认地图）
  const mapCount = await prisma.eventMap.count();
  if (mapCount === 0) {
    const maps = ["攀升", "烬区", "风暴眼", "临界点", "堑壕战", "断层", "断轨"];
    for (let i = 0; i < maps.length; i++) {
      await prisma.eventMap.create({ data: { name: maps[i], sortOrder: i } });
    }
    console.log("✓ 赛事地图已初始化");
  } else {
    console.log(`✓ 赛事地图已存在（${mapCount} 个），跳过`);
  }

  // 9. 干员名单（三角洲行动）
  const operatorCount = await prisma.operator.count();
  if (operatorCount === 0) {
    const operators = [
      "蛊", "骇爪", "深蓝", "露娜", "蜂医", "威龙", "乌鲁鲁", "疾风",
      "无名", "蝶", "牧羊人", "液氮", "比特", "银翼",
    ];
    for (let i = 0; i < operators.length; i++) {
      await prisma.operator.create({ data: { name: operators[i], sortOrder: i } });
    }
    console.log("✓ 干员名单已初始化");
  } else {
    console.log(`✓ 干员已存在（${operatorCount} 个），跳过`);
  }

  console.log("✓ 种子数据处理完成");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
