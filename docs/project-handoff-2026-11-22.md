# Echo Map 项目交接文档

最后更新：2026-11-22（Asia/Shanghai）  
用途：换电脑、换开发者或恢复项目上下文时，先读本文档，再开始修改代码或后台配置。

> 安全规则：本文档不保存任何真实 API key、Secret、私钥、OAuth client secret、Service Account JSON、SMTP 密码或支付密钥。只记录它们的名称、所属系统、保存位置，以及遗失后的恢复方式。

## 0. 当前快照

### 当前代码状态

| 项目 | 当前值 |
| --- | --- |
| 工作区 | `/Users/athena.xu/.codex/worktrees/legal-policy-pages/echomap-web-cn` |
| 当前工作分支 | `codex/legal-policy-pages` |
| 当前 HEAD | `62325c8 feat: style year selector with scrollable options` |
| `origin/main` | `62325c8` |
| 工作区状态 | 干净 |
| GitHub 远端 | `git@github.com:syan1288/echomap-web-cn.git` |
| GitHub HTTPS | `https://github.com/syan1288/echomap-web-cn` |

当前工作区分支名不是 `main`，但它与 `origin/main` 指向同一个提交。新电脑开始工作前，先执行：

```bash
git fetch origin
git status
git log -1 --oneline --decorate
git rev-parse HEAD origin/main
```

### 当前生产状态

| 项目 | 当前值 |
| --- | --- |
| 正式域名 | `https://echomap.syan12.cn` |
| Vercel 项目 | `echo-map` |
| Vercel Project ID | `prj_npSfrF4Aw8Cv4axcgylC24j1a4pD` |
| Vercel Team ID | `team_J2DAHL8pq37Ep6qVpsda5NzL` |
| 最新已知 Production Deployment | `dpl_87cgnDGxs9qYtcgVxk2Eemkjndwa` |
| Deployment 状态 | `READY` |
| Vercel 默认域名 | `https://echo-map-phi.vercel.app` |
| Vercel 项目默认别名 | `https://echo-map-syan1288s-projects.vercel.app` |
| 部署命令 | `npx vercel --prod --yes` |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |

截至本文档更新时间，`HEAD`、`origin/main` 与最近一次生产部署的功能状态一致，最近部署已包含 Year 下拉框逻辑。Vercel CLI 的 `inspect` 输出不一定显示 Git commit，因此换电脑后若要重新确认，应同时核对：

```bash
git rev-parse origin/main
npx vercel ls echo-map --environment production
npx vercel inspect <最新生产部署 URL>
```

生产不是一个 Git 分支。生产是 Vercel 项目的 Production deployment；`main` 是 GitHub 的代码指针。推荐的关系是：

```text
本地工作区 → GitHub origin/main → Vercel Production → echomap.syan12.cn
```

如果本地有未推送修改，它们不会自动进入生产。生产部署必须明确从经过验证的代码提交执行。

### 当前额度和套餐快照

代码与 SQL 的默认值：

| 额度类型 | 当前代码默认值 |
| --- | ---: |
| Free 首次赠送 | 8 次 |
| Free 后续每月 | 1 次 |
| Plus 月度配额 | 20 次 |
| Pro 月度配额 | 40 次 |
| 生成消耗顺序 | starter → monthly → extra credits |

当前代码中的支付兜底值：

| 套餐 | 代码兜底价格 | 代码兜底额度 | 类型 |
| --- | ---: | ---: | --- |
| Plus | ¥5.9 | 20 次 | 一次性生图额度包 |
| Pro | ¥11.9 | 40 次 | 一次性生图额度包 |

当前统一后的产品配置：

| 套餐 | 讨论中的价格 | 讨论中的额度 |
| --- | ---: | ---: |
| Plus | ¥5.9 | 20 次 |
| Pro | ¥11.9 | 40 次 |

真正生效的生产值仍以 Vercel Production 环境变量为准：

```text
ECHO_PLUS_PAYMENT_AMOUNT_CNY
ECHO_PLUS_PAYMENT_CREDITS
ECHO_PRO_PAYMENT_AMOUNT_CNY
ECHO_PRO_PAYMENT_CREDITS
ECHO_FREE_STARTER_GENERATIONS
ECHO_FREE_MONTHLY_GENERATIONS
ECHO_PLUS_MONTHLY_GENERATIONS
ECHO_PRO_MONTHLY_GENERATIONS
```

修改价格或额度时必须同时检查：

1. Vercel Production 环境变量。
2. Supabase `consume_generation_entitlement` 函数的默认参数。
3. `server/entitlements.ts` 的 fallback。
4. `server/paymentOrders.ts` 的支付套餐 fallback。
5. `localization/translations.ts` 中的静态说明文案。
6. `components/VersionPlanModal.tsx` 中的 Balance / 升级展示。
7. 测试文件中的期望值。

不要只改页面文案。额度判断和扣减必须以服务端和数据库为准。

## 1. 产品定位和趣味性

Echo Map 不是普通相册，也不是只生成一张图片的 AI 工具。它把用户去过的地方变成一张可移动、可收藏、可复盘的个人记忆地图。

用户的核心体验是：

1. 用户上传一个建筑或旅行地点的照片。
2. Echo Map 根据照片、地点名称和风格提示词生成一个像素/插画风格的建筑。
3. 建筑被放回地图对应的位置，像一枚属于用户自己的地图标记。
4. 用户可以锁定建筑，表示这段记忆已被收藏。
5. 用户以后回到 Gallery，不只是看图片，还能按城市、国家、洲和年份复盘自己的活动。
6. 照片和音频让建筑成为一段可回放的旅行记忆，而不是静态图标。

产品上的趣味性来自三个循环：

```text
真实照片
  ↓
AI 生成独特建筑
  ↓
地图上的发现与收集
  ↓
锁定建筑 / Gallery 收藏
  ↓
按时间和地理统计，重新发现自己的旅行轨迹
```

建筑的 `unlocked / locked / selected` 状态让用户有“发现、选择、锁定”的轻量游戏感。Gallery 的热力图让积累的记忆在时间维度上可视化，年份下拉框则允许用户回看从注册年份开始的长期记录。

## 2. 系统总览

### 2.1 关系图

```text
                         ┌────────────────────────────┐
                         │ Google Cloud                │
                         │ Vertex AI / Gemini          │
                         │ OAuth Client / IAM          │
                         └─────────────┬──────────────┘
                                       │
                                       │ Gemini 生图 / OAuth 鉴权
                                       │
┌──────────────┐       HTTPS/API       ▼
│ Browser       │ ─────────────────► Vercel Project: echo-map
│ Web / Mobile  │                    ├─ 静态 Vite dist
│ React         │                    ├─ /api/generate
└──────┬───────┘                    ├─ /api/generation-quota
       │                            ├─ /api/payments/*
       │                            └─ /api/geocode
       │
       │ Supabase Auth session / Storage / RLS data
       ▼
┌────────────────────────────────────────────────────────┐
│ Supabase project: polzuzgitmgkohmqwgtf                 │
│ Auth · PostgreSQL · Storage bucket buildings · SMTP     │
│ buildings · echo_entitlements · payment_orders          │
│ credit_ledger                                           │
└─────────┬──────────────────────┬───────────────────────┘
          │                      │
          │ Google provider       │ Custom SMTP
          ▼                      ▼
  Google OAuth App          SMTP provider/account

Vercel Serverless ──► Jimeng / 即梦 API
Vercel Serverless ──► Alipay / WeChat payment API
Vercel Cron ────────► /api/payments/reconcile
```

### 2.2 系统职责

| 系统 | 负责什么 | 不能替代什么 |
| --- | --- | --- |
| GitHub | 保存源代码、提交历史、`main` | 不保存生产 Secret |
| 本地工作区 | 开发、测试、构建、临时 `.env` | 不代表生产已更新 |
| Vercel | 托管静态前端、Serverless API、Production deployment、环境变量 | 不负责 Supabase 数据迁移 |
| Supabase | 登录、Session、数据库、Storage、RLS、SMTP 配置 | 不负责 Vercel 前端部署 |
| Google Cloud | Gemini/Vertex AI、IAM、OAuth Client | 不等于 Supabase Google Provider 已配置 |
| Jimeng/即梦 | 默认生图供应商 | 不负责用户额度数据库 |
| 支付平台 | 付款、回调、交易号 | 不负责 Echo Map 最终额度逻辑 |

## 3. 代码入口和前端结构

### 3.1 启动入口

| 文件 | 作用 |
| --- | --- |
| `index.tsx` | React 根入口、LocalizationProvider、AuthProvider、Web/Mobile 选择、支付回调路由 |
| `App.tsx` | 主要地图业务和桌面 Web 组合 |
| `web/app/WebApp.tsx` | Web shell 的懒加载入口 |
| `mobile/app/MobileApp.tsx` | Mobile shell 的懒加载入口 |
| `mobile/components/MobileShell.tsx` | 手机端地图、设置、Gallery、认证和底部导航 |
| `components/EchoSidebar.tsx` | Web 侧栏、Model、Style、Balance、Account |
| `components/AuthPanel.tsx` | 登录、注册、验证码、Google 密码设置、找回密码 |
| `context/AuthContext.tsx` | Supabase Auth 封装和 Session 状态 |
| `context/LocalizationContext.tsx` | 中英文切换 |
| `localization/translations.ts` | 中英文文案字典 |

### 3.2 Web / Mobile 选择

`index.tsx` 首次加载时选择 shell：

- `VITE_APP_TARGET=mobile` 时强制使用 Mobile。
- 浏览器宽度 `<= 767` 时使用 Mobile。
- Android、iPhone、iPad、iPod 使用 Mobile。
- 触控设备且高度较小时也可能使用 Mobile。
- 其他情况使用 Web。

判断逻辑在：

```text
lib/appShellTarget.ts
```

本地测试：

```bash
npm run dev
VITE_APP_TARGET=mobile npm run dev -- --host 127.0.0.1 --port 5177
```

不要仅通过改变页面内部 CSS 判断移动端是否正确。移动端是另一个 React shell，但很多领域逻辑和文案共用。

## 4. 注册和登录流程

### 4.1 当前支持的方式

| 方式 | 当前实现 | 密码/验证码关系 |
| --- | --- | --- |
| 已有账号邮箱密码登录 | `supabase.auth.signInWithPassword` | 使用 Echo Map/Supabase 用户密码，不是邮箱账户本身的密码 |
| 新用户邮箱注册 | `signInWithOtp({ shouldCreateUser: true })` | Supabase 邮件模板发送一次性验证码；输入验证码后 `verifyOtp` |
| Google 注册/登录 | `signInWithOAuth({ provider: 'google' })` | Google 直接完成身份鉴权；不需要输入 Gmail 密码到 Echo Map |
| Google 首次进入 Echo Map | OAuth 成功后进入设置 Echo Map 应用密码 | 这个密码是 Echo Map 密码，不是 Gmail 密码 |
| 忘记密码 | `resetPasswordForEmail` | 邮件进入回调页后设置新 Echo Map 密码 |

### 4.2 邮箱注册

流程：

```text
点击 Sign up
  ↓
Sign up with email
  ↓
输入邮箱
  ↓
点击 Get code
  ↓
Supabase Auth + Custom SMTP 发送验证码
  ↓
输入验证码，verifyOtp(type=email)
  ↓
设置账户名和 Echo Map 密码
  ↓
登录态建立，进入地图
```

主要函数：

```text
context/AuthContext.tsx
  sendEmailSignupCode
  verifyEmailSignupCode
  setPasswordForCurrentUser

components/AuthPanel.tsx
  emailSignUp
  setPassword
```

邮件验证码发送按钮有 60 秒倒计时，倒计时结束后显示 `Resend`。实际邮件是否能送达由 Supabase SMTP 配置决定，本地环境不会自动替代 SMTP。

### 4.3 邮箱密码登录

流程：

```text
点击 Sign in
  ↓
浏览器有最近使用邮箱记录：
  先显示记住的邮箱，可直接进入密码登录
浏览器没有记录：
  直接显示邮箱 + 密码表单
  ↓
signInWithPassword
  ↓
成功后 Supabase 持久化 Session
```

“默认点击 Sign in 就算登录”只适用于产品内已有可识别的账号信息并且登录动作已经完成的情况。对于没有邮箱记录、没有密码、或 Session 过期的用户，不能绕过密码或 Google OAuth。

当前最近邮箱主要存浏览器本地存储，用于改善下次登录体验。它不是身份凭证，也不能代替 Supabase Session。

### 4.4 Google 登录/注册

流程：

```text
点击 Sign up with Google 或 Google 登录
  ↓
Supabase Auth 发起 Google OAuth
  ↓
Google Cloud OAuth consent / account selection
  ↓
回到 Echo Map
  ↓
首次 Google 用户：
  设置 Echo Map 独立应用密码
已设置过：
  直接进入应用
```

Google 登录后的 Echo Map 密码通过：

```text
user_metadata.echomap_password_set
```

判断是否已经设置。这个字段只是 Echo Map 的用户元数据标记，不是 Gmail 密码。

### 4.5 忘记密码

点击 `Forget password` 后：

1. 调用 `supabase.auth.resetPasswordForEmail`。
2. 重置链接回到：

   ```text
   当前站点/?auth=reset
   ```

3. 页面在原位置显示 `Check your email to reset your password + 60s`。
4. 用户点邮件链接并回到网站后设置新 Echo Map 密码。
5. 设置完成后清除恢复状态并回到邮箱密码登录。

### 4.6 认证后台必须保持一致的配置

Supabase Dashboard：

- Project：
  `https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf`
- Auth Templates：
  `https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/auth/templates`
- SMTP：
  `https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/auth/smtp`

需要检查：

- Email provider 已启用。
- Confirm email 是否按产品要求开启。
- OTP 模板使用验证码变量，而不是只发送 magic link。
- Password reset 模板使用正确的 `{{ .ConfirmationURL }}`。
- Site URL 指向生产域名。
- Redirect URLs 包含生产域名和必要的本地开发地址。
- Google provider 的 Client ID / Client Secret 与 Google Cloud OAuth Client 一致。
- Custom SMTP 的发件人、SMTP host、port、用户名、密码正确。

## 5. 核心玩法

### 5.1 上传回忆和生成建筑

入口：

```text
components/AddBuildingModal.tsx
services/geminiService.ts
api/generate.ts
server/echoApiCore.ts
```

支持的输入：

- 建筑照片。
- 拖放、粘贴、上传按钮。
- 建筑名称或地点搜索。
- 建筑风格。
- 自定义 Style Prompt。
- 图片和音频记忆。

生成前，前端会：

1. 检查文件大小。
2. 必要时转成 JPEG。
3. 将最长边压到约 2048 像素以内。
4. 将源图压到约 3 MB 以内，避免 Base64 JSON 超过 Serverless body limit。
5. 带上 Supabase Session 的 Bearer token。
6. 将 `preferredModel`、建筑名称、风格和用户提示词发送到 `/api/generate`。

后端会：

1. 验证用户 Session。
2. 检查生图额度。
3. 选择 Jimeng、Gemini 或可选的 ChatGPT Image。
4. 拼接系统约束和用户提示词。
5. 调用模型。
6. 只有生图成功后才扣减额度。
7. 返回生成图、模型名、backend 和 entitlement 快照。

### 5.2 建筑状态

建筑核心状态：

- `unlocked`：建筑可被选中和编辑。
- `locked`：建筑已经收藏/锁定。
- `locked + selected`：锁定建筑当前被用户选中，可打开操作扇面。

锁定建筑进入 Gallery 的收藏语义。建筑位置、尺寸、翻转、风格、处理后的图片路径和回忆数据一起保存。

### 5.3 图片、音频和 Storage

Supabase Storage bucket：

```text
buildings
```

推荐保持私有。路径约定：

```text
{user_id}/{building_id}/...
```

数据库中的 `buildings.photos` 只保存 metadata，例如：

```json
[
  {
    "path": "user-id/building-id/photo-0.jpg",
    "name": "original.jpg"
  }
]
```

实际图片/音频放 Storage，数据库保存路径和业务 metadata。RLS 使用 `auth.uid() = user_id`，不要把 bucket 改成公开后再用公开 URL 代替权限控制。

相关文件：

```text
services/cloudBuildings.ts
components/MemoryPhotoModal.tsx
components/MemoryAudioModal.tsx
components/TravelLogModal.tsx
supabase/001_schema.sql
```

### 5.4 复盘回忆和统计

Gallery 的统计维度：

- 城市。
- 国家。
- 洲。
- 选中年份。
- 上传照片数量。
- 上传日期。
- 月份/周热力图。

相关组件：

```text
components/GallerySection.tsx
components/TravelHeatmapCalendar.tsx
components/GalleryDetailModals.tsx
shared/domain/gallery/travelHeatmapData.ts
components/YearSelect.tsx
```

Year 规则：

- 第一个可选年份是用户注册所在年份。
- 默认显示当前年份。
- 可选范围到当前年份。
- 选项少于 5 个时全部显示。
- 超过 5 个时白色下拉弹层内部滚动，最多同时显示约 5 行。
- Web 和 Mobile 使用相同的年份计算规则。

注册年份必须来自用户资料或注册时间，不能只根据当前浏览器日期猜测。若注册年份没有正确传入，年份选择器会退回当前年份，导致历史年份缺失。

## 6. 生图模型、路由、系统 Prompt 和成本

### 6.1 当前模型

默认模型是 Jimeng / 即梦：

```text
请求 key 默认：jimeng_seedream46_cvtob
```

Gemini 默认模型：

```text
gemini-3.1-flash-lite-image
```

当前代码允许用户切换：

- `jimeng`
- `gemini`

可选的 ChatGPT Image / OpenAI-compatible 路径仍保留在后端代码，但不应在未配置和未测试的生产环境中默认展示给用户。

模型相关文件：

```text
services/geminiService.ts
api/generate.ts
server/echoApiCore.ts
server/jimengImageInput.ts
shared/domain/image/jimengPrompt.ts
components/EchoSidebar.tsx
mobile/components/MobileShell.tsx
```

### 6.2 当前模型路由

前端将用户选择作为 `preferredModel` 发送：

```text
preferredModel = jimeng → 即梦路径
preferredModel = gemini → Gemini/Vertex 路径
未选择或默认 → 按前端默认和服务端配置处理
```

不要把“自动路由”理解为已经存在完整的成本优化系统。当前代码有 provider 可用性检查和模型切换，但没有一个完整的后台价格表、质量评分、失败率、重试成本和动态路由策略。

后续如果要做自动路由，建议新增：

```text
model_catalog
  provider
  model
  unit_cost
  active
  quality_score
  latency_score
  supported_regions
  updated_at
```

然后把路由策略放在服务端，按成本、可用性、用户选择和任务类型决策。用户手动选择应优先于自动路由。

### 6.3 系统 Prompt

系统 Prompt 在 `api/generate.ts` 中与用户提示词拼接/传入模型，约束包括：

- 输入照片只作为建筑结构参考。
- 不直接复制原图背景、人物、天空、地面、游客、车辆和招牌。
- 保留建筑可识别的地标特征。
- 使用选定建筑风格。
- 生成图优先只返回图片。

System Prompt 主要影响：

- 输出稳定性。
- 结构符合度。
- 是否需要重试。
- 是否更容易被内容过滤或返回文本。

它不会直接让第三方模型的单次标价变便宜。它可能通过减少失败和重试，间接降低平均成本；但如果 Prompt 过长，也可能增加输入 token 或请求体处理成本。Gemini 失败后的 retry 会产生额外模型调用，所以要监控 retry 比例。

### 6.4 成本记录方式

代码当前记录：

- 用户请求的 provider/model。
- generation request id。
- generation stage。
- entitlement 消耗。
- `credit_ledger` 的 `consume` 事件。

代码当前没有把厂商真实账单价格写入数据库，也没有完整的每次生成成本表。因此“模型成本”和“用户额度流水”是两个系统：

```text
厂商账单：Jimeng / Google Cloud / 其他供应商控制台
用户额度：Supabase echo_entitlements + credit_ledger
```

如果要真正算利润，需要每天或每次生成额外写入 usage 记录，至少包含：

```text
user_id
provider
model
request_id
success
retry_count
input_bytes
output_bytes
estimated_cost_cny
created_at
```

真实利润公式：

```text
收入
- 生图供应商成本
- 重试成本
- 邮件成本
- 存储和带宽成本
- 支付手续费
- Vercel / Supabase / Google Cloud 基础费用
= 毛利
```

在没有厂商当前价格和账单明细时，不要在产品文案中承诺“每次成本固定”或“套餐一定盈利”。

## 7. 额度管理和用户流水账本

### 7.1 额度来源

用户可用的生图次数由三类 bucket 组成：

1. `starter_generation_used` 对应 Free 首次体验额度。
2. `generation_used` 对应当前自然月额度。
3. `extra_credits` 对应购买的一次性额度包。

当前扣减顺序：

```text
Free starter
  ↓ 用完后
当前月度配额
  ↓ 用完后
购买的 extra credits
  ↓ 都用完
402 GENERATION_QUOTA_EXHAUSTED
```

只有后端拿到成功的图片结果后才执行扣减。生图供应商失败时不应扣用户次数。

### 7.2 数据表

#### `echo_entitlements`

一行一个用户，保存当前额度快照：

- `user_id`
- `plan`: `free | plus | pro`
- `period_key`: 当前月，格式 `YYYY-MM`
- `generation_used`
- `starter_generation_used`
- `extra_credits`
- `generation_unlimited`
- `landmark_count`
- `photo_count`
- `storage_bytes_used`
- `last_purchased_plan`
- `created_at`
- `updated_at`

#### `payment_orders`

一行一个支付订单：

- 订单 id。
- 用户 id。
- `plan_id`。
- 价格。
- 本次购买次数。
- provider。
- 状态。
- 支付平台交易号。
- 回调时间。

状态包括：

```text
pending_manual_confirmation
pending_wechat_payment
confirmed
```

#### `credit_ledger`

不可只看当前余额，必须保留流水：

- `grant`：支付或后台发放额度。
- `consume`：成功生图扣减。
- `release`：资源删除后释放存储/资源类额度时使用。
- `refund`：退款。
- `admin_adjustment`：管理员手工调整。

关键字段：

- `user_id`
- `payment_order_id`
- `event_type`
- `source`
- `credits_delta`
- `metadata`
- `created_at`

支付 grant 有唯一索引，防止同一个支付回调重复加额度。

### 7.3 额度 API

| API | 作用 |
| --- | --- |
| `GET/POST /api/generation-quota` | 返回当前用户是否允许生图和余额快照 |
| `POST /api/generate` | 鉴权、检查额度、调用模型、成功后扣减 |
| `POST /api/payments/create-order` | 创建支付订单 |
| `POST /api/payments/confirm-order` | 订单确认并发放额度 |
| `GET /api/payments/status` | 查询支付状态 |
| `POST /api/payments/alipay/notify` | 支付宝异步回调 |
| `POST /api/payments/wechat/notify` | 微信 Native 异步回调 |
| `POST /api/payments/reconcile` | 定时对账/补偿 |
| `POST /api/usage-quota` | 建筑、图片、存储使用量检查和释放 |

### 7.4 生产必须使用数据库存储

正式生产不能依赖 Vercel Serverless 本地 JSON 文件：

```text
ECHO_ENTITLEMENTS_STORE=supabase
ECHO_PAYMENT_ORDERS_STORE=supabase
ECHO_ENTITLEMENTS_TABLE=echo_entitlements
```

如果仍是 `file`：

- 本地单进程测试可能正常。
- 多个 Serverless 实例之间可能看不到同一份文件。
- 重启后文件可能不可靠。
- 支付回调和用户生图可能产生额度不一致。

数据库 RPC：

```text
public.confirm_payment_order
public.grant_extra_credits
public.consume_generation_entitlement
```

这些函数使用行锁和服务端权限。重复支付回调应返回已确认订单，不重复发放额度。

### 7.5 Balance UI

用户侧菜单已经从旧的 Version/Plan 概念改为：

```text
Balance / 余额
```

点击后分两层：

1. Current plan / 当前套餐
   - 显示当前套餐名。
   - 显示剩余生图次数。
2. Upgrade plan / 升级套餐
   - 显示 Plus、Pro。
   - 从 `/api/payments/create-order` 获取价格和次数。

余额显示来自 `/api/generation-quota`，不是静态文案。每次成功生图后会触发：

```text
echomap:generation-completed
```

Balance 面板监听该事件并刷新。

相关文件：

```text
components/VersionPlanModal.tsx
server/generationQuotaApiCore.ts
server/entitlements.ts
```

## 8. 支付流程

### 8.1 支持的支付代码路径

当前代码支持：

- `manual`
- `wechat_native`
- `alipay_page`

支付正式链路：

```text
用户选择套餐
  ↓
创建 payment_orders 订单
  ↓
支付宝/微信付款
  ↓
支付平台异步回调
  ↓
验签、核对金额、核对交易号
  ↓
幂等确认订单
  ↓
增加 echo_entitlements.extra_credits
  ↓
写入 credit_ledger grant
  ↓
用户生图成功后写入 credit_ledger consume
```

### 8.2 支付配置风险

当前 Vercel Production 已看到这些变量名：

```text
ECHO_PAYMENT_PROVIDER
ECHO_PAYMENT_ORDERS_STORE
ALIPAY_ENV
ALIPAY_APP_ID
ALIPAY_APP_PRIVATE_KEY
ALIPAY_PUBLIC_KEY
ALIPAY_SELLER_ID
ALIPAY_RETURN_URL
ALIPAY_NOTIFY_URL
CRON_SECRET
```

“变量存在”不等于“值正确”，因为 Vercel CLI 会隐藏 Secret。换电脑或重新部署时必须验证：

- `ECHO_PAYMENT_PROVIDER` 是否是实际想启用的 provider。
- `ECHO_PAYMENT_ORDERS_STORE` 是否为 `supabase`。
- `ECHO_ENTITLEMENTS_STORE` 是否为 `supabase`。
- 支付宝环境是否为 `production`。
- Notify URL 与正式域名一致。
- 回调签名公钥和私钥属于同一套应用。
- Supabase SQL 已执行到 `005_balance_and_purchased_plan.sql`。

## 9. Supabase 数据库和 Storage

### 9.1 项目

| 项目 | 值 |
| --- | --- |
| Supabase project ref | `polzuzgitmgkohmqwgtf` |
| Project URL | `https://polzuzgitmgkohmqwgtf.supabase.co` |
| Dashboard | `https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf` |
| Auth Templates | `https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/auth/templates` |
| Custom SMTP | `https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/auth/smtp` |
| Storage bucket | `buildings`，建议保持 private |

### 9.2 SQL 迁移顺序

在 Supabase SQL Editor 中按顺序检查/执行：

```text
supabase/001_schema.sql
supabase/002_entitlements.sql
supabase/003_payment_orders_and_credit_ledger.sql
supabase/004_alipay_webpay.sql
supabase/005_balance_and_purchased_plan.sql
```

`004` 只有在支付宝支付路径启用时需要。执行前先确认当前数据库是否已有同名表、函数和触发器。SQL 设计大部分使用 `if not exists` / `create or replace`，但仍要在正式库执行前备份和检查。

### 9.3 Supabase 前端和服务端 key

前端：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

旧兼容变量：

```text
VITE_SUPABASE_ANON_KEY
```

服务端：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
```

旧兼容变量：

```text
SUPABASE_SERVICE_ROLE_KEY
```

规则：

- publishable/anon key 可以出现在浏览器构建中，但必须依赖 RLS。
- `SUPABASE_SECRET_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 只能放服务端。
- 服务端 key 忘记明文后，不能从代码或前端恢复，应在 Supabase 控制台轮换。
- 更换服务端 key 后，要同步更新 Vercel Production。

## 10. Google Cloud、IAM 和 Google OAuth App

### 10.1 Google Cloud 项目

| 项目 | 值 |
| --- | --- |
| Project ID | `echo-map-493411` |
| Console | `https://console.cloud.google.com/home/dashboard?project=echo-map-493411` |
| 主要 API | Vertex AI API |
| 主要用途 | Gemini 生图、Google OAuth 配置、IAM |

### 10.2 三类容易混淆的 Google 凭证

#### A. Google OAuth Client

用于“Sign in with Google”：

```text
Google Cloud Console
  → APIs & Services
  → Credentials
  → OAuth 2.0 Client IDs
```

它需要与 Supabase Auth Provider → Google 中的 Client ID/Secret 完全一致。

OAuth redirect 需要覆盖：

```text
https://echomap.syan12.cn
```

本地开发若要使用 Google OAuth，还要加入实际本地 origin，例如：

```text
http://localhost:5173
http://127.0.0.1:5173
```

具体可加入的地址必须与 Supabase Auth URL 配置一起检查。

#### B. IAM Service Account / Service Account JSON

用于 Vertex AI / Gemini 服务端调用：

```text
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
GOOGLE_SERVICE_ACCOUNT_JSON
```

本地也可以使用：

```text
GOOGLE_APPLICATION_CREDENTIALS=/绝对路径/service-account.json
```

Vercel 没有稳定的本地文件系统，因此生产优先使用 `GOOGLE_SERVICE_ACCOUNT_JSON`，由服务端临时解析。

#### C. Gmail App Password / Custom SMTP 密码

用于 Supabase Custom SMTP 时，不等于 OAuth Client Secret，也不等于 IAM Service Account。它通常在 Gmail 账户的 Google Account → Security → App passwords 中创建。

忘记后不能查看旧值，只能删除旧的 App Password 并重新生成，再回到 Supabase SMTP 更新。

### 10.3 Google 凭证找回规则

| 凭证 | 能否找回原值 | 正确做法 |
| --- | --- | --- |
| OAuth Client ID | 可以查看 | Google Cloud Credentials |
| OAuth Client Secret | 通常不应依赖找回 | reset/rotate，更新 Supabase |
| Service Account JSON 私钥 | 不能安全找回 | 删除旧 key，创建新 JSON key，更新 Vercel |
| Gemini API key | 通常不能恢复明文 | 重新生成并替换 |
| Gmail App Password | 不能查看旧值 | 删除并重新生成 |

不要把这些值提交到 GitHub，也不要把完整 JSON 粘到交接文档。

## 11. Vercel、GitHub 和生产部署

### 11.1 Vercel 配置

仓库中的：

```text
.vercel/repo.json
```

保存了 Vercel project/team 绑定信息。它不是 Secret，但不能替代 Vercel 登录权限。

`vercel.json` 配置：

- `npm run build`
- 输出目录 `dist`
- 支付 API rewrite。
- `/api/echo-health` rewrite 到生成服务健康检查。
- `api/generate.ts` 最大执行时间 120 秒，内存 1024 MB。
- `/api/payments/reconcile` 最大执行时间 60 秒。
- 每天 UTC 03:00 运行支付 reconcile cron。

### 11.2 生产部署命令

新电脑完成 GitHub、Vercel 登录后：

```bash
npm ci
npm run build
npx vercel link
npx vercel env pull .env.production.local --environment=production
npx vercel --prod --yes
```

如果已在正确 Vercel 项目目录中，`vercel link` 不需要重复执行。

部署前：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
npm ci
npm run build
npm run test:phone-auth
npm run test:entitlements
git diff --check
```

部署后：

```bash
npx vercel ls echo-map --environment production
npx vercel inspect <最新部署 URL>
curl -I https://echomap.syan12.cn
```

需要用浏览器实际验证：

- Web 与 Mobile shell 是否正确。
- 邮箱验证码是否能收到。
- Google 登录是否能回调。
- Google 首次登录是否进入设置 Echo Map 密码。
- Balance 是否显示当前余额。
- 生图成功后余额是否减少。
- 支付回调后余额是否增加。
- Gallery Year 下拉框是否与注册年份和当前年份一致。

### 11.3 后台查看地址和连接关系

#### GitHub

- 仓库：`https://github.com/syan1288/echomap-web-cn`
- 作用：保存源代码、SQL、测试和部署配置。
- 连接：Vercel 项目可从 GitHub 部署，也可以使用本项目当前采用的 `npx vercel --prod --yes` 手动部署。
- 不保存：Vercel、Supabase、Google Cloud、SMTP、支付平台的 Secret。

#### Vercel

- 项目：`https://vercel.com/syan1288s-projects/echo-map`
- Deployments：`https://vercel.com/syan1288s-projects/echo-map/deployments`
- Environment Variables：`https://vercel.com/syan1288s-projects/echo-map/settings/environment-variables`
- Production：`https://echomap.syan12.cn`
- 连接：
  - 构建 GitHub 代码。
  - 前端通过 `VITE_SUPABASE_URL` 和 publishable key 连接 Supabase。
  - Serverless 通过服务端 Supabase key 写额度、订单和流水表。
  - 通过 Google Cloud service account 调用 Vertex/Gemini。
  - 通过 Jimeng、支付宝或微信支付环境变量调用对应供应商。

#### Supabase

- 项目：`https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf`
- API/URL：`https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/settings/api`
- Auth Providers：`https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/auth/providers`
- Auth Templates：`https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/auth/templates`
- Custom SMTP：`https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/auth/smtp`
- SQL Editor：`https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/sql`
- Storage：`https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/storage/buckets`
- 连接：
  - 浏览器通过 `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` 登录、读取自己的数据和 Storage。
  - Vercel Serverless 通过 `SUPABASE_URL` + `SUPABASE_SECRET_KEY` 写额度、支付订单和 `credit_ledger`。
  - Supabase Auth 的 Google provider 连接 Google OAuth Client。
  - Supabase Auth 的邮件发送连接 Custom SMTP。

#### Google Cloud / IAM / Google OAuth

- 项目总览：`https://console.cloud.google.com/home/dashboard?project=echo-map-493411`
- Credentials：`https://console.cloud.google.com/apis/credentials?project=echo-map-493411`
- IAM：`https://console.cloud.google.com/iam-admin/iam?project=echo-map-493411`
- API Library：`https://console.cloud.google.com/apis/library?project=echo-map-493411`
- 连接：
  - Vertex/Gemini：Google Cloud project + IAM service account → Vercel 的 `GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`、`GOOGLE_SERVICE_ACCOUNT_JSON`。
  - Google 登录：OAuth Client ID/Secret → Supabase Auth Providers → `signInWithOAuth({ provider: 'google' })`。
  - OAuth redirect 必须同时在 Google Cloud 和 Supabase Auth URL 设置中允许生产域名。

#### SMTP

- 配置入口：`https://supabase.com/dashboard/project/polzuzgitmgkohmqwgtf/auth/smtp`
- SMTP host、port、username、password、sender name 和 sender email 只在 Supabase Auth SMTP 中查看/修改。
- 如果使用 Gmail App Password，App Password 在 Google Account → Security → App passwords 管理；它与 Google OAuth Client Secret、Vertex Service Account JSON 完全不同。
- SMTP 只负责验证码、注册确认和密码重置邮件，不参与 Google OAuth、生图或支付。

#### 支付平台

- 支付宝开放平台：`https://open.alipay.com/`
- 微信支付商户平台：`https://pay.weixin.qq.com/`
- Vercel 支付环境变量：`https://vercel.com/syan1288s-projects/echo-map/settings/environment-variables`
- 连接：
  - 支付平台创建/确认交易。
  - 支付平台回调 Vercel 的 `/api/payments/alipay/notify` 或 `/api/payments/wechat/notify`。
  - Vercel 验签、核对金额和交易号。
  - Vercel 通过 Supabase RPC 更新订单、余额和 `credit_ledger`。
- 当前 provider 的实际值应在 Vercel Production 环境变量中核对 `ECHO_PAYMENT_PROVIDER`，不要从前端页面猜测。

#### 地图和生图供应商

- Mapbox token：`https://account.mapbox.com/access-tokens/`
- Jimeng/火山引擎控制台：`https://console.volcengine.com/`
- 连接：
  - 浏览器通过 `VITE_MAPBOX_ACCESS_TOKEN` 加载 Mapbox。
  - Vercel Serverless 通过 `JIMENG_ACCESS_KEY_ID`、`JIMENG_SECRET_ACCESS_KEY` 和 `JIMENG_REQ_KEY` 调用即梦。
  - Gemini/Vertex 的连接见 Google Cloud 小节。

## 12. 环境变量字典

以下只列名称和用途，不列真实值。

### 12.1 生图

| 变量 | 用途 | 保存位置 |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google API Key 模式 | Vercel Secret 或本地 `.env` |
| `GOOGLE_CLOUD_PROJECT` | Vertex project | Vercel Config |
| `GOOGLE_CLOUD_LOCATION` | Vertex 区域，当前通常 `us-central1` | Vercel Config |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Vertex 服务账号 JSON | Vercel Secret |
| `GOOGLE_APPLICATION_CREDENTIALS` | 本地服务账号 JSON 文件路径 | 本地 `.env`，不要提交文件 |
| `GEMINI_IMAGE_MODEL` | Gemini 生图模型 | Vercel Secret/Config |
| `ECHO_IMAGE_MODEL` | 兼容旧模型覆盖变量 | Vercel Secret/Config |
| `JIMENG_ACCESS_KEY_ID` | 即梦访问 id | Vercel Secret |
| `JIMENG_SECRET_ACCESS_KEY` | 即梦访问 secret | Vercel Secret |
| `JIMENG_BASE_URL` | 即梦 API 地址 | Vercel Config |
| `JIMENG_REQ_KEY` | 默认 `jimeng_seedream46_cvtob` | Vercel Config |
| `JIMENG_REGION` | 即梦区域 | Vercel Config |
| `JIMENG_SERVICE` | 即梦服务名 | Vercel Config |
| `JIMENG_SIZE` | 请求图片尺寸/大小配置 | Vercel Config |
| `JIMENG_SCALE` | 图片缩放配置 | Vercel Config |
| `JIMENG_IMAGE_MODEL` | 旧兼容模型变量 | Vercel Config |
| `OPENAI_API_KEY` | 可选 ChatGPT Image/OpenAI-compatible | Vercel Secret |
| `OPENAI_BASE_URL` | 可选网关地址 | Vercel Config |
| `OPENAI_IMAGE_MODEL` | 可选模型名 | Vercel Config |
| `OPENAI_IMAGE_SIZE` | 可选图片尺寸 | Vercel Config |
| `OPENAI_IMAGE_QUALITY` | 可选图片质量 | Vercel Config |
| `OPENAI_IMAGE_RESOLUTION` | 可选分辨率 | Vercel Config |

### 12.2 Supabase/Auth

| 变量 | 用途 | 保存位置 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | 浏览器 Supabase URL | Vercel Config |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 浏览器 publishable key | Vercel Config |
| `VITE_SUPABASE_ANON_KEY` | 旧浏览器兼容 key | Vercel Config |
| `SUPABASE_URL` | 服务端 Supabase URL | Vercel Config |
| `SUPABASE_PUBLISHABLE_KEY` | 服务端兼容变量 | Vercel Config/Secret |
| `SUPABASE_SECRET_KEY` | 服务端数据库权限 key | Vercel Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | 旧服务端兼容 key | Vercel Secret |

### 12.3 额度和支付

| 变量 | 用途 |
| --- | --- |
| `ECHO_GENERATION_QUOTA_ENABLED` | 是否启用生图额度拦截 |
| `ECHO_ENTITLEMENTS_STORE` | `file` 或 `supabase` |
| `ECHO_ENTITLEMENTS_STORE_PATH` | 本地 JSON 额度文件位置 |
| `ECHO_ENTITLEMENTS_TABLE` | 正式应为 `echo_entitlements` |
| `ECHO_FREE_STARTER_GENERATIONS` | Free 首次额度 |
| `ECHO_FREE_MONTHLY_GENERATIONS` | Free 月度额度 |
| `ECHO_PLUS_MONTHLY_GENERATIONS` | Plus 月度额度 |
| `ECHO_PRO_MONTHLY_GENERATIONS` | Pro 月度额度 |
| `ECHO_INITIAL_EXTRA_CREDITS` | 初始额外额度 |
| `ECHO_PAYMENT_ORDERS_STORE` | `file` 或 `supabase` |
| `ECHO_PAYMENT_ORDERS_PATH` | 本地 JSON 订单文件位置 |
| `ECHO_PAYMENT_PROVIDER` | `manual`、`wechat_native`、`alipay_page` |
| `ECHO_PLUS_PAYMENT_URL` | 手工支付链接 |
| `ECHO_PRO_PAYMENT_URL` | 手工支付链接 |
| `ECHO_PLUS_PAYMENT_AMOUNT_CNY` | Plus 价格 |
| `ECHO_PRO_PAYMENT_AMOUNT_CNY` | Pro 价格 |
| `ECHO_PLUS_PAYMENT_CREDITS` | Plus 一次性额度 |
| `ECHO_PRO_PAYMENT_CREDITS` | Pro 一次性额度 |
| `ECHO_PLUS_PAYMENT_INSTRUCTIONS` | Plus 支付说明 |
| `ECHO_PRO_PAYMENT_INSTRUCTIONS` | Pro 支付说明 |
| `ECHO_PAYMENT_ADMIN_KEY` | 手工订单管理 key |
| `CRON_SECRET` | 支付 reconcile cron 保护 |

支付宝：

```text
ALIPAY_ENV
ALIPAY_APP_ID
ALIPAY_APP_PRIVATE_KEY
ALIPAY_PUBLIC_KEY
ALIPAY_SELLER_ID
ALIPAY_SELLER_EMAIL
ALIPAY_GATEWAY
ALIPAY_RETURN_URL
ALIPAY_NOTIFY_URL
```

微信支付：

```text
WECHAT_PAY_APPID
WECHAT_PAY_MCHID
WECHAT_PAY_MERCHANT_SERIAL_NO
WECHAT_PAY_MERCHANT_PRIVATE_KEY
WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH
WECHAT_PAY_NOTIFY_URL
WECHAT_PAY_API_V3_KEY
WECHAT_PAY_PLATFORM_SERIAL_NO
WECHAT_PAY_PLATFORM_PUBLIC_KEY
WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH
```

### 12.4 地图和部署

| 变量 | 用途 |
| --- | --- |
| `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox 地图 token |
| `VITE_MAPBOX_STYLE` | Mapbox style |
| `VITE_AMAP_WEB_KEY` | 高德 Web API key |
| `VITE_AMAP_JS_KEY` | 高德 JS API key |
| `VITE_AMAP_MAP_STYLE` | 高德地图样式 |
| `VITE_APP_VARIANT` | `global` 或 `cn` |
| `VITE_API_BASE_URL` | 前后端分域时的 API 根地址 |
| `ALLOW_ORIGIN` | API CORS 来源 |
| `VITE_MAP_TILE_URL` | 备用瓦片 URL |
| `VITE_MAP_TILE_ATTRIBUTION` | 瓦片版权文案 |
| `VITE_MAP_TILE_SUBDOMAINS` | 瓦片子域 |
| `VITE_PLACE_SEARCH_TEMPLATE` | 地点搜索模板 |
| `VITE_REVERSE_GEOCODE_TEMPLATE` | 逆地理编码模板 |
| `VITE_IP_GEO_URL` | IP 定位服务 |

## 13. Secret 存储、找回和轮换

### 13.1 本地

本地敏感配置放：

```text
.env
.env.local
.env.production.local
```

这些文件必须被 `.gitignore` 忽略。当前工作区的 `.env.local` 只发现 `VERCEL_OIDC_TOKEN`，没有把项目运行时 Secret 作为可迁移资产依赖。

新电脑推荐从 Vercel 拉取：

```bash
npx vercel env pull .env.production.local --environment=production
```

拉取后只用于本地排查，不要 `git add`。

### 13.2 Vercel

当前 Production 环境变量已配置过 Supabase、即梦、Google Cloud、Mapbox、支付宝、额度和支付相关变量。可以查看变量名：

```bash
npx vercel env ls production
```

Secret 的原值通常不会在列表里显示。需要本地临时恢复时使用：

```bash
npx vercel env pull .env.production.local --environment=production
```

如果拉取权限不足，重新登录正确的 Vercel Team，或由项目 owner 在 Vercel 控制台更新。

### 13.3 Secret 遗失处理

| Secret | 存放 | 原值能否找回 | 处理 |
| --- | --- | --- | --- |
| Supabase Secret API key | Vercel Production Secret | 不应依赖找回 | Supabase 轮换，更新 Vercel |
| Supabase service role key | Vercel Production Secret | 不应依赖找回 | 轮换或迁移到 Secret API key |
| Jimeng Secret Access Key | Vercel Production Secret | 通常不能查看 | 即梦控制台创建新 key，替换 Vercel |
| Google Service Account JSON | Vercel Production Secret | 私钥不能恢复 | 删除旧 key、创建新 JSON、更新 Vercel |
| Google OAuth Client Secret | Google Cloud + Supabase | 不应依赖找回 | rotate/reset，双方同步 |
| Gemini API key | Google/Vertex 控制台 | 通常不能查看 | 生成新 key |
| Mapbox token | Mapbox Dashboard/Vercel | 可以重新生成 | 创建/轮换新 token，更新 Vercel |
| Alipay private/public key | Vercel Secret + 支付宝控制台 | 不应依赖找回 | 重新生成并更新双方 |
| WeChat merchant private key | 商户平台/服务器 Secret | 不应依赖找回 | 重新下载/生成并更新服务 |
| Gmail App Password | Google Account Security | 不能查看旧值 | 删除旧值，重新生成 |
| `CRON_SECRET` | Vercel Secret | 不应依赖找回 | 生成新的随机值并重新部署 |

轮换后必须做一次端到端验证。只修改 Vercel 变量但不重新部署，生产 Serverless 可能仍运行旧配置。

## 14. 新电脑迁移步骤

### 14.1 获取代码

```bash
git clone git@github.com:syan1288/echomap-web-cn.git
cd echomap-web-cn
npm ci
git fetch origin
git switch main
git pull --ff-only origin main
```

如果没有 SSH key：

```bash
git clone https://github.com/syan1288/echomap-web-cn.git
```

### 14.2 绑定 Vercel

```bash
npx vercel login
npx vercel link
npx vercel env pull .env.production.local --environment=production
```

检查文件没有被 Git 跟踪：

```bash
git status --short
git check-ignore .env.production.local
```

### 14.3 本地开发

```bash
npm run dev
```

打开 Vite 输出的地址。不要双击 `index.html`，因为 `file://` 没有 `/api/generate`、Supabase 回调和正确的 origin。

移动端 shell：

```bash
VITE_APP_TARGET=mobile npm run dev -- --host 127.0.0.1 --port 5177
```

### 14.4 验证顺序

建议按这个顺序验证，避免把前端问题误判成供应商问题：

1. `npm run build`
2. 登录页能加载。
3. 邮箱注册能发验证码。
4. 验证码能完成注册。
5. 邮箱密码登录成功。
6. Google OAuth 回调成功。
7. Google 首次登录能设置 Echo Map 密码。
8. Mapbox 地图加载。
9. `GET /api/echo-health` 返回 provider 状态。
10. Balance 返回当前余额。
11. 生成一张图，确认成功后余额减少 1。
12. Gallery、音频、图片和 Year 选择器正常。
13. 如果开启支付，再测试沙箱/小额真实链路和重复回调。

### 14.5 本地文件迁移清单

#### 必须进入 Git / 必须迁移

- `components/`
- `mobile/`
- `web/`
- `context/`
- `services/`
- `server/`
- `api/`
- `supabase/`
- `shared/`
- `lib/`
- `localization/`
- `prompts/`
- `tests/`
- `scripts/`
- `deploy/`
- `docs/`
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `vercel.json`
- `.env.example`

本次交接文档也必须提交：

```text
docs/project-handoff-2026-11-22.md
```

#### 不需要迁移

以下内容可以在新电脑重新生成：

```text
node_modules/
dist/
.vercel/
.DS_Store
```

- `node_modules/`：新电脑执行 `npm ci`。
- `dist/`：新电脑执行 `npm run build`。
- `.vercel/`：执行 `npx vercel link` 重新绑定；其中只保存项目 id/team id，不保存生产 Secret。
- `.DS_Store`：macOS Finder 垃圾文件。

当前 `.env.local` 只发现 `VERCEL_OIDC_TOKEN`。这个 token 不建议复制到新电脑，重新 `npx vercel login` 或 `npx vercel env pull` 更安全。

#### 不在代码仓库、但必须重新确认的外部资产

- Supabase 数据库实际内容。
- Supabase Auth provider、邮件模板、Site URL、Redirect URL。
- Supabase Custom SMTP。
- Supabase Storage `buildings` bucket 和对象。
- Google Cloud OAuth Client。
- Google Cloud IAM service account。
- Google Service Account JSON。
- Jimeng key。
- Mapbox token。
- 支付宝/微信支付密钥和回调设置。
- Vercel Production 环境变量。

这些不是复制文件可以完成的迁移，必须用对应控制台账号重新登录并核对。

## 15. 日常开发和发布纪律

### 开始工作

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git status
```

### 提交前

```bash
npm run build
npm run test:phone-auth
npm run test:entitlements
git diff --check
git status
```

### 推送 main

```bash
git add <明确的文件>
git commit -m "描述本次改动"
git push origin main
```

不要把 `.env`、`.env.local`、`.env.production.local`、服务账号 JSON、支付宝私钥、微信私钥加入提交。

### 部署生产

```bash
npx vercel --prod --yes
```

部署之后核对 alias：

```bash
npx vercel inspect <部署 URL>
```

### 数据库改动

数据库 schema 改动不能只推 GitHub。需要：

1. SQL 文件进入 Git。
2. 在 Supabase 正式项目 SQL Editor 执行。
3. 检查表、函数、RLS、trigger。
4. 再部署依赖这些表/函数的代码。

## 16. 已知风险和未完成项

### 16.1 额度与价格

当前统一配置是：

```text
Free：8 starter + 1/month
Plus：¥5.9/20
Pro：¥11.9/40
```

代码、支付 fallback、配置模板、Supabase RPC 默认值、页面文案和测试已按此规则统一。生产环境仍需确认 Vercel Production 的四个套餐变量已更新。

### 16.2 生产 store 值

Vercel 变量列表中能看到：

```text
ECHO_ENTITLEMENTS_STORE
ECHO_PAYMENT_ORDERS_STORE
ECHO_PAYMENT_PROVIDER
```

已确认 `ECHO_ENTITLEMENTS_STORE=supabase`，生产额度数据走 Supabase。

`ECHO_PAYMENT_ORDERS_STORE` 和 `ECHO_PAYMENT_PROVIDER` 被 Vercel 标记为 Secret，CLI 拉取时只返回 `[SENSITIVE]`，因此无法从 CLI 读取原值。需要在 Vercel Project Settings → Environment Variables 中查看或重新写入。订单存储应明确设置为 `supabase`；支付 provider 需以实际启用的平台为准。

### 16.3 自动模型路由还不是完整系统

现在是用户可切换 Jimeng/Gemini，默认 Jimeng。还没有基于实时价格、质量、延迟、失败率的完整自动路由。

### 16.4 成本账本还不是厂商账单账本

`credit_ledger` 是用户额度流水，不是人民币成本流水。要计算真实利润，仍需接入供应商用量或在每次请求后写入估算成本。

### 16.5 File store 只适合本地/单进程

如果生产的 entitlement/order store 还是 `file`，需要尽快切换到 Supabase。Vercel Serverless 上的本地文件不能作为多实例的权威数据库。

### 16.6 邮件送达依赖 Custom SMTP

本地页面显示“发送成功”只代表 Supabase API 接受了请求，不代表邮箱一定收到。需要检查：

- SMTP host/port/用户名/密码。
- 发件人域名。
- SPF/DKIM/DMARC。
- Supabase Auth template。
- Gmail/Outlook 垃圾邮件。
- 邮箱供应商和 Supabase 的 rate limit。

### 16.7 当前本地 Git 分支风险

当前状态：

```text
codex/legal-policy-pages = 62325c8
origin/main              = 62325c8
本地 main                = 96d55f8，落后 origin/main 68 个提交
```

换电脑后不要直接使用本地旧 `main` 判断项目是否最新。必须先执行：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

如果 `main` 有本地未提交或本地独有提交，先保存 patch 或建立备份分支，再处理同步。不要用 `git reset --hard` 直接覆盖，除非已经确认没有需要保留的本地工作。

当前仓库还存在一些历史 worktree/分支，例如：

```text
codex/mobile-parity
codex/auth-flow-production
codex/otp-removal-quota-persistence
```

它们可能包含历史实验或旧版本流程，不应当在新电脑上默认合并。恢复产品工作以 `origin/main` 为准。

## 17. 恢复工作 Checklist

换电脑后按下面逐项打勾：

- [ ] GitHub SSH 或 HTTPS 登录成功。
- [ ] clone 到正确仓库 `syan1288/echomap-web-cn`。
- [ ] `origin/main` 与预期提交一致。
- [ ] Vercel 登录到正确 Team。
- [ ] Vercel 项目为 `echo-map`。
- [ ] 能拉取 Production env，但没有把它提交。
- [ ] Supabase project ref 为 `polzuzgitmgkohmqwgtf`。
- [ ] Supabase Auth Site URL / Redirect URL 正确。
- [ ] Google OAuth Client 与 Supabase Provider 一致。
- [ ] Google Service Account / Vertex 配置有效。
- [ ] Custom SMTP 能发送测试邮件。
- [ ] Mapbox token 有效。
- [ ] Jimeng key 和 req key 有效。
- [ ] `ECHO_ENTITLEMENTS_STORE` 已确认是 `supabase`。
- [ ] `ECHO_PAYMENT_ORDERS_STORE` 已确认是 `supabase`。
- [ ] `ECHO_PAYMENT_PROVIDER` 与实际支付方式一致。
- [ ] Supabase SQL 001–005 已执行并核对。
- [ ] 邮箱注册验证码流程通过。
- [ ] 邮箱密码登录流程通过。
- [ ] Google 登录流程通过。
- [ ] Google 首次登录设置 Echo Map 密码流程通过。
- [ ] Balance 显示正确。
- [ ] 成功生图后余额减少。
- [ ] 支付确认后余额增加且只增加一次。
- [ ] 图片、音频、建筑锁定和 Gallery 统计正常。
- [ ] Web / Mobile Year 下拉框正常。
- [ ] `npm run build` 通过。
- [ ] 生产域名 `https://echomap.syan12.cn` 可访问。

## 18. 最重要的记忆点

1. GitHub `main` 是代码来源，Vercel Production 是运行版本，Supabase 是用户和业务数据来源。
2. Google OAuth 登录不是把 Gmail 密码交给 Echo Map；Google 首次登录后设置的是 Echo Map 独立密码。
3. `credit_ledger` 记录用户额度变动，不等于厂商人民币成本账单。
4. 生图成功才扣额度，供应商失败不应扣次数。
5. 默认模型是 Jimeng/即梦，Gemini 可由用户切换；自动成本路由尚未完成。
6. 生产额度和支付必须使用 Supabase 数据库，不要使用 Serverless 本地 JSON 文件。
7. Secret 不能靠 Git 找回；大多数情况是轮换后更新 Vercel、Supabase 或供应商控制台。
8. 修改额度时要同时检查环境变量、Supabase RPC、服务端 fallback、页面文案和测试。
9. 当前快照是 `62325c8`，生产别名是 `https://echomap.syan12.cn`。
