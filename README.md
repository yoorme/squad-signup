# 三角洲行动战队报名系统

面向《三角洲行动》战队的内部管理系统，覆盖赛事报名、队员管理、公告发布、邀请码注册等完整业务流程。基于 Next.js App Router 构建，采用 Windows Fluent 设计风格。

## 功能概览

### 队员端

- **公告** — 查看战队公告（支持 Markdown + 图片），自动标记已读，可确认与留言
- **赛事** — 浏览赛事并报名，支持分队选择与替补，自动满员降级
- **队员** — 查看所有队员的能力、职责、擅长干员（浮动入口）
- **我的** — 修改昵称/密码，维护个人能力、职责、擅长干员

### 管理员端

- **标签维护** — 管理能力、职责、干员、赛事性质、赛事名称、分队性质、赛事地图
- **用户管理** — 查看队员、提升/降级管理员、重置密码、禁用账号
- **邀请码** — 生成注册邀请码（支持多次使用）、查看使用情况
- **公告管理** — 发布/编辑/删除公告、查看阅读与确认统计
- **赛事管理** — 创建赛事、修改标签/地图/赛制/分队性质、归档

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16（App Router）、React 19 |
| 语言 | TypeScript |
| 数据库 | PostgreSQL（生产 Neon，本地可 Docker） |
| ORM | Prisma 6 |
| 认证 | NextAuth v5（Credentials + JWT） |
| 样式 | Fluent Design 风格 CSS（亚克力、Win11 控件） |
| 密码 | bcryptjs |
| Markdown | react-markdown + remark-gfm + rehype |

## 快速开始

### 环境要求

- Node.js ≥ 20
- PostgreSQL（本地或远程）

### 安装

```bash
git clone https://github.com/yoorme/squad-signup.git
cd squad-signup
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env` 并填入真实值：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL pooled 连接串（运行时用，带 `?pgbouncer=true&sslmode=require`） |
| `DIRECT_URL` | PostgreSQL 直连串（Prisma 迁移用） |
| `AUTH_SECRET` | NextAuth 密钥，生成：`openssl rand -base64 32` |
| `INITIAL_ADMIN_USERNAME` | 初始管理员用户名（首次 seed 创建） |
| `INITIAL_ADMIN_PASSWORD` | 初始管理员密码 |
| `NEXTAUTH_URL` | 站点 URL（本地 `http://localhost:3000`） |
| `AUTH_TRUST_HOST` | 自托管/IP 访问建议 `true` |

### 初始化数据库

```bash
# 生成 Prisma Client
npm run postinstall

# 执行迁移
npm run db:migrate

# 写入种子数据（初始管理员 + 默认标签 + 默认地图）
npm run seed
```

种子数据包含：
- 初始管理员账号（按 `.env` 配置）
- 默认赛事性质：正赛、训练赛、娱乐赛、其他
- 默认赛事地图：攀升、烬区、风暴眼、临界点、堑壕战、断层、断轨

### 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)，使用初始管理员账号登录。

## 部署

### Vercel

1. Fork 仓库并导入到 Vercel
2. 在 Settings → Environment Variables 配置上述所有环境变量
3. `DATABASE_URL` 用 Neon pooled 串，`DIRECT_URL` 用 Neon 直连串
4. 构建命令 `npm run build` 会自动执行迁移与种子

### 其他平台

需保证构建时能访问到 `DATABASE_URL` 与 `DIRECT_URL`。构建流程：

```
prisma migrate deploy → tsx prisma/seed.ts → next build
```

## 项目结构

```
squad-signup/
├── prisma/
│   ├── schema.prisma          # 数据模型定义
│   ├── seed.ts                # 种子数据
│   └── migrations/            # 数据库迁移
├── src/
│   ├── app/
│   │   ├── (app)/             # 需登录的应用路由组
│   │   │   ├── announcements/ # 公告列表与详情
│   │   │   ├── events/        # 赛事列表与详情
│   │   │   ├── members/       # 队员列表
│   │   │   ├── me/            # 个人信息
│   │   │   └── admin/         # 管理后台
│   │   ├── api/               # API 路由
│   │   ├── login/             # 登录页
│   │   └── register/          # 注册页
│   ├── components/
│   │   ├── events/            # 赛事相关组件
│   │   ├── layout/            # 布局组件（AppShell）
│   │   └── ui/                # 通用 UI（Toast、Modal、Markdown 等）
│   ├── lib/                   # 工具函数（prisma、auth、api、constants）
│   └── auth.ts                # NextAuth 配置
└── package.json
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建（含迁移与种子） |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 代码检查 |
| `npm run seed` | 写入种子数据 |
| `npm run db:migrate` | 创建并应用迁移 |
| `npm run db:push` | 直接同步 schema 到数据库 |
| `npm run db:studio` | 打开 Prisma Studio |

## License

私有项目，未授权。
