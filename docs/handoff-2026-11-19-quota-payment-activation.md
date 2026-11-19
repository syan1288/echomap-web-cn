# Echo Map 额度与支付开通交接文档

日期：2026-11-19（Asia/Shanghai）  
工作区：`/Users/athena.xu/data-project/design/echomap-web-cn`  
生产分支：`main`  
生产地址：<https://echomap.syan12.cn>

## 本次已完成

- 建筑 Gallery 详情面板右下角 `> Go to memories` 已改为和左上角 `&lt; Back to gallery` 一致的灰色文字。
- Web、移动端构建均通过。
- 当前提交：`640d641 Match gallery detail navigation text color`
- 本次交接后会继续把文档提交到 `main` 并部署生产。

## 当前额度链路

用户在 Version Plan 中点击 Plus 或 Pro 后，前端执行：

1. 打开一个空白支付窗口，避免浏览器拦截新窗口。
2. 调用 `POST /api/payments/create-order`。
3. 服务端校验登录身份和套餐是否启用。
4. 创建订单并返回 `paymentUrl`。
5. 浏览器跳转到支付链接。

当前代码不会在“点击套餐”时直接加额度。直接点击就发额度会导致任何登录用户都能无限领取，不能用于真实收费。

真正的开通动作是服务端调用：

```ts
confirmPaymentOrder(...)
```

它会：

- 校验订单存在；
- 校验支付金额（如果回调提供金额）；
- 防止同一订单重复确认；
- 调用 `grantExtraCredits(userId, order.credits, env)`；
- 把订单状态改成 `confirmed`。

发放的额度写入 `echo_entitlements.extra_credits`，生图成功后再按现有规则消耗额度。

## 两种开通方案

### 方案 A：微信支付 Native 自动开通，正式方案

用户点击 Plus/Pro 后，服务端向微信支付 Native API 创建订单并返回二维码链接。用户付款后，微信支付服务器请求：

```text
POST /api/payments/wechat/notify
```

服务端会验证微信签名、解密通知、确认 `TRANSACTION.SUCCESS`、校验订单金额，然后自动调用 `confirmPaymentOrder` 发放额度。

需要在 Vercel Production 配置：

```text
ECHO_PAYMENT_PROVIDER=wechat_native
WECHAT_PAY_APPID=...
WECHAT_PAY_MCHID=...
WECHAT_PAY_MERCHANT_SERIAL_NO=...
WECHAT_PAY_MERCHANT_PRIVATE_KEY=...
WECHAT_PAY_API_V3_KEY=...
WECHAT_PAY_PLATFORM_SERIAL_NO=...
WECHAT_PAY_PLATFORM_PUBLIC_KEY=...
WECHAT_PAY_NOTIFY_URL=https://echomap.syan12.cn/api/payments/wechat/notify
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=...
ECHO_ENTITLEMENTS_STORE=supabase
```

其中私钥、API V3 密钥、平台公钥和 Supabase Secret API key 只能放在服务端环境变量，不能放进前端、Git 或交接文档。

微信商户后台还需要：

- 配置 Native 支付能力；
- 配置支付回调地址为 `WECHAT_PAY_NOTIFY_URL`；
- 下载并配置微信支付平台公钥；
- 确认商户证书序列号和 API V3 密钥匹配；
- 使用真实金额做一笔小额测试订单。

### 方案 B：支付链接 + 人工确认，验证期方案

如果暂时没有微信商户号，可以先用 Plus/Pro 外部收款链接：

```text
ECHO_PLUS_PAYMENT_URL=...
ECHO_PRO_PAYMENT_URL=...
ECHO_PLUS_PAYMENT_AMOUNT_CNY=5
ECHO_PRO_PAYMENT_AMOUNT_CNY=12.9
ECHO_PLUS_PAYMENT_CREDITS=20
ECHO_PRO_PAYMENT_CREDITS=60
ECHO_PAYMENT_ADMIN_KEY=...
```

用户完成付款后，产品方根据订单号调用：

```text
POST /api/payments/confirm-order
Authorization: Bearer <ECHO_PAYMENT_ADMIN_KEY>
Content-Type: application/json
```

请求示例：

```json
{
  "orderId": "pay_...",
  "amountFen": 500,
  "providerTransactionId": "manual-20261119-001"
}
```

该接口确认成功后，用户立即获得对应 `extra_credits`。这是目前最容易上线的人工闭环，但不是“用户付款后自动开通”。

## 推荐的实际开通顺序

1. 先确认 Supabase 已执行 `supabase/002_entitlements.sql`。
2. 在 Vercel Production 配置服务端 Supabase Secret API key。
3. 配置 `ECHO_ENTITLEMENTS_STORE=supabase`，不要继续依赖 Vercel 文件存储。
4. 先选择方案 B，用一个真实 Plus 订单测试“创建订单、人工确认、额度增加、生图扣减”。
5. 确认额度链路正常后，再接微信 Native 自动回调。
6. 微信回调测试成功后，才向普通用户开放 Plus/Pro。

## 验证清单

- [ ] `GET /api/payments/create-order` 能看到已启用套餐。
- [ ] 未登录用户不能创建订单。
- [ ] Plus 订单金额和额度正确：默认 ¥5 / 20 次。
- [ ] Pro 订单金额和额度正确：默认 ¥12.9 / 60 次。
- [ ] 同一订单重复确认不会重复发额度。
- [ ] 错误金额不能确认订单。
- [ ] 微信回调签名错误不能发额度。
- [ ] 支付成功后 `echo_entitlements.extra_credits` 增加。
- [ ] 生图成功后才扣减额度，失败请求不扣用户额度。
- [ ] 用户刷新页面后仍能读取到新额度。

## 相关代码

- 前端套餐点击：`components/EchoSidebar.tsx`
- 创建订单：`api/payments-create-order.ts`
- 订单与套餐：`server/paymentOrders.ts`
- 人工确认：`api/payments-confirm-order.ts`
- 微信回调：`api/payments-wechat-notify.ts`
- 微信 Native 下单：`server/wechatPayNative.ts`
- 微信回调验签与解密：`server/wechatPayNotify.ts`
- 额度存储与发放：`server/entitlements.ts`
- Supabase 表结构：`supabase/002_entitlements.sql`
- 额度持久化说明：`docs/quota-persistence.md`

## 安全边界

不要把“点击套餐”直接改成 `grantExtraCredits`。  
自动发放必须以支付平台签名回调为依据；人工方案必须由受保护的管理员接口确认。否则用户只要打开 Version Plan 就能免费获得 Plus/Pro 额度。
