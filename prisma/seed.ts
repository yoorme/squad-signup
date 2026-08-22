import { PrismaClient, AbilityCategory } from "@prisma/client";

const prisma = new PrismaClient();

// 规范化战队前缀：去掉尾部旧分隔符后统一追加固定「丨」。
// 与 src/lib/constants.ts 的 normalizeTeamPrefix 等价；因 dist 产物不含 src/，
// 此处内联实现避免跨目录依赖（管理后台保存前缀时走同一规则，保证格式一致）。
function normalizeTeamPrefix(input: string): string {
  const letters = input.replace(/[丨|｜/\\·．.．\-—_~\s]+$/u, "").trim();
  return letters ? `${letters}丨` : "";
}

async function main() {
  // 重要：seed 只在表为空时插入初始数据，避免复活管理员已删除的数据
  // 首次安装时表为空 → 正常插入
  // 更新时表非空 → 整个表跳过（管理员删除的干员/标签不会被复活）

  // 0. 站点设置（战队前缀）
  // TEAM_PREFIX 由 install.sh 首次安装时询问并写入 .env（默认空 = 无前缀）。
  // 仅输入战队缩写：落库前统一规范化为「缩写+固定分隔符丨」。
  // 仅在「全新库」（无任何用户）时创建设置行；存量老库的前缀已由迁移
  // 20260821000000_add_site_setting 的回填 SQL 从历史用户名推导写入。
  // 注意：不再创建任何默认账户 —— 初始管理员由部署脚本在终端创建
  // （install.sh / deploy.sh / npm run create-admin，见 prisma/create-admin.ts）。
  const teamPrefix = normalizeTeamPrefix(process.env.TEAM_PREFIX ?? "");
  const settingCount = await prisma.siteSetting.count();
  const userCount = await prisma.user.count();
  if (settingCount === 0 && userCount === 0) {
    await prisma.siteSetting.create({
      data: { id: "global", teamPrefix },
    });
    console.log(`✓ 战队前缀已初始化: ${teamPrefix || "（无前缀）"}`);
  } else if (settingCount === 0) {
    console.log("✓ 检测到已有用户数据，站点设置保持默认（前缀可在管理后台「战队管理」中配置）");
  } else {
    console.log("✓ 站点设置已存在，跳过");
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
