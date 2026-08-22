// ============ 创建初始管理员（幂等） ============
// 供各部署路径在终端调用（install.sh / deploy.sh / npm run create-admin）。
// 仅当系统中还没有任何用户时创建；已有用户则跳过（重跑安全）。
//
// 用法：
//   ADMIN_NICKNAME=admin ADMIN_PASSWORD=123456 npm run create-admin
// 环境变量：
//   ADMIN_NICKNAME  管理员昵称（不含战队前缀，1-16 个字符、不含空白）
//   ADMIN_PASSWORD  密码（6-64 个字符；仅内存传递，不落盘）
// 前缀取数据库 SiteSetting（seed 已写入），保证与站点实际配置一致。
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const nickname = (process.env.ADMIN_NICKNAME || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!nickname) {
    console.error("✗ 请通过 ADMIN_NICKNAME 指定管理员账户");
    process.exit(1);
  }
  if (nickname.length > 16 || /\s/.test(nickname)) {
    console.error("✗ 管理员账户不合法（需 1-16 个字符、不含空白）");
    process.exit(1);
  }
  if (password.length < 6 || password.length > 64) {
    console.error("✗ ADMIN_PASSWORD 不合法（需 6-64 个字符）");
    process.exit(1);
  }

  const count = await prisma.user.count();
  if (count > 0) {
    console.log("✓ 数据库已有用户，跳过初始管理员创建");
    return;
  }

  const setting = await prisma.siteSetting.findUnique({
    where: { id: "global" },
  });
  const prefix = setting?.teamPrefix ?? "";
  if (prefix && nickname.startsWith(prefix)) {
    console.error(`✗ 昵称无需包含战队前缀「${prefix}」（系统会自动拼接）`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username: prefix + nickname, nickname, passwordHash, role: "ADMIN" },
  });
  console.log(`✓ 初始管理员已创建：${user.username}`);
}

main()
  .catch((e) => {
    console.error("✗ " + e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
