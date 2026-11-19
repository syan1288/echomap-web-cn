# Echo Map 接力卡

日期：2026-11-19（Asia/Shanghai）  
工作区：`/Users/athena.xu/data-project/design/echomap-web-cn`  
当前分支：`codex/mobile-parity`  
生产分支：`origin/main`

## 目标

继续维护 Echo Map 的 Web/移动端、生图质量、额度支付链路和生产部署。

## 当前进展

### 已完成并部署

- Gemini/Vertex 生图固定 system prompt 已增强：
  - 删除输入截图中的棋盘格、UI、文字、聊天窗口、边框、虚线和水印；
  - 必须从屋顶完整呈现到地基、底座或台阶；
  - 禁止裁切顶部、底部、左右两侧；
  - 遮挡时合理补全建筑结构；
  - 禁止半透明、褪色、幽灵化、悬空建筑；
  - 建筑居中，保留约 8%–12% 安全边距，占画布高度约 65%–85%。
- 左侧导航和 Map 页线性 icon 使用共享描边变量 `ICON_STROKE_WIDTH = 2.1`。
- Gallery 详情面板右下角 `Go to memories` 已改为与左上角一致的灰色文字。
- 支付/额度交接文档已写入资金流、订单、额度、调用流水和自动开通方案。
- 手机打开生产 URL 时运行时选择 MobileShell，桌面端运行 WebShell。
- Capacitor 构建仍可通过 `VITE_APP_TARGET=mobile` 强制使用移动端。

### 最新提交与部署

- 最新提交：`91dec38 Select mobile shell on phone-sized browsers`
- `origin/main` 已指向 `91dec38`
- 最新生产部署：
  - URL：<https://echomap.syan12.cn>
  - Deployment：`dpl_4WmFgyzT5CRghwAhG6FE1Uwrh3za`
  - 状态：READY

## 最近验证

- `node --import tsx --test lib/appShellTarget.test.ts`
  - 4 passed, 0 failed
- `npm run build:mobile`
  - passed
- `npm run build`
  - passed
- `git diff --check`
  - passed

## 关键文件

- 运行时 Web/Mobile 入口：
  - `index.tsx`
  - `lib/appShellTarget.ts`
  - `mobile/app/MobileApp.tsx`
  - `web/app/WebApp.tsx`
- 移动端页面：
  - `mobile/components/MobileShell.tsx`
  - `mobile/components/MobileShell.css`
- 生图固定规则：
  - `shared/domain/building-style/buildingStyle.ts`
  - `api/generate.ts`
  - `vite-plugin-echo-api.ts`
- 额度与支付：
  - `server/entitlements.ts`
  - `server/paymentOrders.ts`
  - `server/wechatPayNative.ts`
  - `server/wechatPayNotify.ts`
  - `api/payments-create-order.ts`
  - `api/payments-confirm-order.ts`
  - `api/payments-wechat-notify.ts`
  - `supabase/002_entitlements.sql`
- 交接文档：
  - `docs/handoff-2026-11-19-quota-payment-activation.md`

## 当前阻塞与注意事项

### 手机端

- 生产普通构建现在按屏幕宽度/设备特征加载 MobileShell。
- 如果用户手机仍看到旧 Web 页面：
  1. 关闭旧标签页；
  2. 重新打开 <https://echomap.syan12.cn>；
  3. 必要时清除该站点缓存或使用无痕窗口。
- Service worker 当前会主动注销并清理缓存，因此通常重新加载即可。

### 额度和支付

- 生产 `GET /api/payments/create-order` 曾返回 `{"plans":[]}`，说明 Plus/Pro 支付环境变量还未启用。
- 点击套餐不能直接发额度。安全链路必须是：

```text
创建订单
→ 用户付款
→ 支付平台回调
→ 服务端验签
→ 幂等确认订单
→ 增加 extra_credits
→ 生图成功后扣减额度
```

- `echo_entitlements` 可记录用户当前套餐、月度调用次数、`extra_credits` 和资源用量。
- 当前支付订单默认仍可能写本地 JSON 文件。Vercel 正式收款前，应迁移到 Supabase `payment_orders` 表。
- 正式上线建议增加 `generation_usage_events` 额度流水表，记录 grant、consume、refund、admin 等事件。
- 需要先完成 Supabase 表、服务端 Secret key、微信商户配置和支付回调，再做真实小额订单测试。

### 工作区

- 工作区存在大量用户已有未跟踪文件，包括 `.envcd`、`.playwright-cli/`、Android、宣传素材和旧交接文档。
- 不要使用 `git add .`，不要提交密钥或这些无关文件。
- 当前本次修改已提交，除上述未跟踪文件外没有待提交的目标改动。

## 下一步

1. 让用户在手机重新打开生产 URL，确认底部 MobileShell 导航是否出现。
2. 如果仍显示 Web，记录设备浏览器、屏幕宽度和是否使用旧 PWA/缓存，再检查入口缓存。
3. 额度链路先配置 Supabase `echo_entitlements` 和 `payment_orders` 持久化。
4. 选择人工支付确认或微信 Native 自动回调方案。
5. 用一笔小额 Plus 订单验证：
   - 订单创建；
   - 支付确认；
   - 额度增加；
   - 生图成功扣减；
   - 重复回调不重复发放。
6. 生图质量若仍不稳定，再加入上传图片的主体裁剪/背景分割预处理，不能只继续堆 system prompt。

## 恢复工作时建议先执行

```bash
cd /Users/athena.xu/data-project/design/echomap-web-cn
git status --short
git log -5 --oneline --decorate
npm run build
npm run build:mobile
```
