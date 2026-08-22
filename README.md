# 三角洲行动战队报名系统

面向《三角洲行动》战队的内部管理系统，覆盖赛事报名、队员管理、公告发布、邀请码注册等完整业务流程。基于 Next.js App Router 构建，采用 Windows Fluent 设计风格。

## 功能概览

### 队员端

- **公告** — 查看战队公告（支持 Markdown + 图片），自动标记已读，可确认与留言
- **赛事** — 浏览赛事并报名，支持分队选择与替补，自动满员降级
- **队员** — 查看所有队员的能力、职责、擅长干员（浮动入口）
- **我的** — 修改昵称/密码，维护个人能力、职责、擅长干员

### 管理员端

- **战队管理** — 修改全局战队名称前缀（自动迁移已有用户名）、上传战队图标（网页图标，仅支持 32×32 的 .ico）
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

## 安装

系统**不预置任何默认账号**：推荐用下方一键脚本安装，在安装过程中于终端直接创建初始管理员（默认 `admin` / `123456`）；若安装时未创建，首次打开站点时登录页会显示「系统初始化」表单，在那里创建初始管理员账户。

### 方式一：一键脚本（推荐，Linux 服务器）

在服务器上直接运行（自动识别安装/更新）：

```bash
curl -fsSL https://raw.githubusercontent.com/yoorme/squad-signup/main/install.sh | bash
```

安装过程会依次询问：

1. **PostgreSQL 连接串**（数据库需自行准备）
2. **服务端口**（默认 3000，可自定，校验 1-65535 合法性）
3. **战队名称前缀**（默认无前缀，用于登录用户名拼接与站点标题，之后可在管理后台修改）
4. **初始管理员账户与密码**（默认 `admin` / `123456`，密码输入不回显；账户自动拼接战队前缀，登录直接用账户+密码即可）
5. **站点 URL**（默认按服务器 IP 与所选端口生成）

管理员在安装完成时直接创建进数据库；使用默认密码 123456 会在结尾提示，登录后请立即修改。

完成后用 `systemctl status squad-signup` 查看状态。

非交互自动化部署：

```bash
DATABASE_URL=... DIRECT_URL=... NEXTAUTH_URL=https://... \
  NONINTERACTIVE=1 bash install.sh
# 可选：PORT=8080 TEAM_PREFIX=XX丨
#       ADMIN_NICKNAME=admin ADMIN_PASSWORD=你的密码（不填则用默认 admin/123456）
```

### 方式二：Docker Compose

```bash
git clone https://github.com/yoorme/squad-signup.git
cd squad-signup
bash deploy.sh   # 自动生成随机密钥的 .env 并构建启动
```

或在 `docker-compose.yml` 同目录自行准备 `.env`（参考下方环境变量表；`POSTGRES_PASSWORD`、`AUTH_SECRET` 必填），然后 `docker compose up -d --build`。对外端口用 `PORT` 控制（默认 3000）。

### 方式三：本地开发

```bash
git clone https://github.com/yoorme/squad-signup.git
cd squad-signup
npm install
cp .env.example .env   # 填入本地数据库等配置
npm run db:migrate
npm run seed
npm run dev
```

### 方式四：Vercel 等托管平台

Fork 后导入，在 Settings → Environment Variables 配置环境变量（`DATABASE_URL` 用 Neon pooled 串，`DIRECT_URL` 用直连串），构建命令 `npm run build` 会自动执行迁移与种子。

## 更新

服务器上执行（与安装是同一条命令，已有配置会被保留，不会再询问任何问题）：

```bash
curl -fsSL https://raw.githubusercontent.com/yoorme/squad-signup/main/install.sh | bash
```

或使用独立的更新脚本（功能等价，仅更新不安装）：

```bash
bash update.sh
```

更新过程说明：

- `.env`、上传的图片与自定义战队图标全部保留，不会丢失
- 数据库结构变更通过 `prisma migrate deploy` 自动应用
- 存量部署的战队名称前缀由迁移从历史用户名自动推导写入，无需手动处理
- 下载源自动优选：内置 6 个 GitHub 加速镜像 + 原生地址，每次安装/更新先并行测速、自动选最快的源下载，失败自动切换下一个（无需手动配置；也可用 `MIRROR_URL=...` 追加自选镜像候选）

### 更新中断了怎么办

更新全流程是**幂等**的——任何一步中断（断网、断电、手动 Ctrl+C）后，**重新执行同一条更新命令即可自动继续/修复**，无需手动清理：

| 中断位置 | 恢复机制 |
|----------|----------|
| 下载/校验 | 临时文件自动清理；下载了半截文件会因 gzip 校验失败被拒，旧版本完好；下载失败时脚本会自动把旧版本启动回来 |
| 替换产物 | 原子替换：旧目录先改名保留为 `standalone.old` → 移入新版 → 成功后才清理；替换失败自动回滚。任意时刻中断都保证「旧版或新版至少一个完整可用」 |
| 数据库迁移 | `prisma migrate deploy` 按迁移记录表逐个应用：已执行的自动跳过，未执行的继续执行 |
| 服务配置 | systemd 服务文件可重复写入，重跑即覆盖为最新 |

唯一的例外：若中断发生在替换产物的瞬间（`standalone.old` 残留、`standalone` 缺失），服务会暂时无法启动——重新执行更新命令即可完整恢复，脚本会把这种状态自动识别为「继续更新」。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串（运行时用） |
| `DIRECT_URL` | PostgreSQL 直连串（Prisma 迁移用；本地可与上相同） |
| `AUTH_SECRET` | NextAuth 密钥，生成：`openssl rand -base64 32` |
| `NEXTAUTH_URL` | 站点 URL（本地 `http://localhost:3000`） |
| `AUTH_TRUST_HOST` | 自托管/IP 访问建议 `true` |
| `PORT` | 服务端口（默认 3000） |
| `TEAM_PREFIX` | 战队名称前缀（首次 seed 时写入数据库，默认空 = 无前缀） |
| `UPLOAD_DIR` | 上传文件持久目录（默认 `<安装目录>/uploads`） |

初始管理员由 install.sh 首次安装时在终端创建（默认 `admin` / `123456`，可用 `ADMIN_NICKNAME` / `ADMIN_PASSWORD` 环境变量覆盖）；若安装时未创建（如旧版本升级上来），首次访问站点会进入「系统初始化」页面创建。

## 默认种子数据

首次部署时写入以下默认标签（仅当对应表为空时），均可在管理后台「标签维护」中修改或删除：

| 类别 | 默认内容 |
|------|----------|
| 能力（步兵） | 突击、医疗、侦查、正面、机动、狙击、反载 |
| 能力（载具） | 驾驶、焊工、骇车 |
| 职责 | 队长、指挥、无 |
| 赛事性质 | 正赛、训练赛、娱乐赛、其他 |
| 赛事名称 | 百姓杯 |
| 分队性质 | 步兵、载具、机动、指挥 |
| 赛事地图 | 攀升、烬区、风暴眼、临界点、堑壕战、断层、断轨 |
| 干员 | 蛊、骇爪、深蓝、露娜、蜂医、威龙、乌鲁鲁、疾风、无名、蝶、牧羊人、液氮、比特、银翼 |

## 项目结构

```
squad-signup/
├── prisma/
│   ├── schema.prisma          # 数据模型定义
│   ├── seed.ts                # 种子数据（默认标签，不含账号）
│   └── migrations/            # 数据库迁移
├── src/
│   ├── app/
│   │   ├── (app)/             # 需登录的应用路由组
│   │   │   ├── announcements/ # 公告列表与详情
│   │   │   ├── events/        # 赛事列表与详情
│   │   │   ├── members/       # 队员列表
│   │   │   ├── me/            # 个人信息
│   │   │   └── admin/         # 管理后台（含战队管理）
│   │   ├── api/               # API 路由
│   │   ├── login/             # 登录页（含首次部署的系统初始化）
│   │   ├── register/          # 注册页
│   │   └── favicon.ico/       # 动态网页图标路由（战队管理中上传的图标）
│   ├── components/
│   │   ├── events/            # 赛事相关组件
│   │   ├── layout/            # 布局组件（AppShell）
│   │   └── ui/                # 通用 UI（Toast、Modal、Markdown 等）
│   ├── lib/                   # 工具函数（prisma、auth、site-settings 等）
│   └── auth.ts                # NextAuth 配置
├── install.sh                 # 一键安装/更新脚本
├── update.sh                  # 更新脚本（预构建产物模式）
├── deploy.sh                  # Docker 部署脚本
└── docker-compose.yml
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建（含迁移与种子） |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 代码检查 |
| `npm run seed` | 写入种子数据（幂等） |
| `npm run db:migrate` | 创建并应用迁移 |
| `npm run db:push` | 直接同步 schema 到数据库 |
| `npm run db:studio` | 打开 Prisma Studio |

## License

私有项目，未授权。
