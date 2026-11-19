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

## 钱如何流转给产品方

用户的钱不会先进入 Echo Map 自己的数据库，也不会由 Supabase 保管。数据库只记录订单、支付状态和用户可用额度。

正式微信支付 Native 流程如下：

```text
用户
  ↓ 扫码并付款
微信支付平台
  ↓ 按商户结算规则结算
微信支付商户号绑定的结算账户
  ↓ 商户自行提现/对账
你的银行卡或对公账户
```

Echo Map 后端只负责：

1. 向微信支付创建订单；
2. 把订单号和金额写入订单存储；
3. 接收微信支付成功回调；
4. 验证签名、解密回调并核对订单号与金额；
5. 支付确认后给用户发放 Echo Map 额度。

微信支付 Native 是 PC 网页扫码支付能力。用户在微信确认收款方和金额后完成付款；交易资金由微信支付按照商户结算规则结算到商户绑定的结算账户。具体结算周期、手续费、提现方式和到账时间以你的商户主体、签约产品及微信支付商户平台显示为准。

因此，想让“钱给到你”，必须先有：

- 可收款的微信支付商户主体；
- 已绑定并验证的结算银行账户；
- 已开通 Native 支付权限；
- 商户平台里的证书、API V3 密钥和平台公钥；
- 商户平台配置的支付回调地址；
- 定期在商户平台下载交易/资金账单做对账。

微信支付官方也提供交易账单和资金账单能力，正式运营时需要将微信账单与 Echo Map 的订单记录进行核对，处理“微信已支付但回调暂时未到达”的情况。

如果使用第三方支付链接，资金流转由第三方收款平台决定。此时钱不会自动进入 Echo Map，也不会自动进入你的个人账户，必须确认该平台的收款主体、提现账户、手续费、退款能力和订单回调能力。

## 数据库如何记录额度和调用次数

当前额度表是 Supabase 的：

```text
public.echo_entitlements
```

每个用户一行，核心字段如下：

| 字段 | 作用 |
| --- | --- |
| `user_id` | Supabase 用户 ID，唯一 |
| `plan` | `free` / `plus` / `pro` |
| `period_key` | 当前月，例如 `2026-11` |
| `generation_used` | 当前月已成功生图次数 |
| `starter_generation_used` | Free 新人额度已使用次数 |
| `extra_credits` | 购买或人工赠送的剩余生图次数 |
| `landmark_count` | 已保存建筑数量 |
| `photo_count` | 已保存照片数量 |
| `storage_bytes_used` | 已使用的照片存储空间 |
| `updated_at` | 最近一次变更时间 |

额度判断顺序是：

```text
Free 新人额度
→ 当月套餐额度
→ extra_credits 购买额度
→ 全部用完后拒绝生图
```

只有生图成功后才扣减用户额度。上游 Gemini/即梦失败，不应该扣用户额度。

### 订单表与额度表要分开

生产环境至少需要两类数据：

```text
payment_orders
  记录用户买了什么、付了多少钱、支付是否成功

echo_entitlements
  记录用户现在还剩多少额度、使用了多少资源
```

当前代码中的 `payment_orders` 默认仍通过 `server/paymentOrders.ts` 写本地 JSON 文件。这个方式只能用于单机测试，不适合 Vercel Serverless 正式收款，因为实例之间不共享本地文件。正式开通前应增加 Supabase `payment_orders` 表，并把订单创建、支付回调确认、重复确认保护放到数据库事务或唯一约束中。

### 建议增加额度流水表

`echo_entitlements` 只保存余额和累计计数，适合快速判断能不能生图，但不够审计。正式上线建议再增加：

```text
generation_usage_events
  id
  user_id
  request_id
  provider
  model
  event_type          -- grant / reserve / consume / release / refund
  credits_delta       -- 增加为正，扣减为负
  source              -- payment / generation / admin / refund
  payment_order_id
  created_at
```

这样可以回答：

- 这个用户的额度从哪里来？
- 哪一笔订单发了额度？
- 哪一次生图扣了额度？
- 是否发生重复回调或重复扣减？
- 退款后需要回收多少额度？
- Gemini 429 或服务失败时有没有误扣？

## 额度如何管控

服务端必须是唯一可信入口，浏览器不能直接修改 `echo_entitlements`：

1. 浏览器只携带登录 token 请求后端；
2. 后端从 token 得到 `userId`，不能相信前端传来的用户 ID；
3. 支付回调必须验证支付平台签名；
4. 订单号必须唯一；
5. 支付确认接口必须幂等，同一订单重复回调不能重复加额度；
6. 生图扣额要使用服务端的原子更新或数据库事务；
7. 额度不足时先拒绝请求，不要让前端自己计算剩余次数；
8. 管理员补额度必须有独立的管理员密钥、操作人、原因和流水记录；
9. 退款、撤销和争议订单需要有反向扣回额度的流程；
10. 定期用支付账单、订单表、额度流水表三方对账。

目前已有的 `confirmPaymentOrder` 可以完成“确认订单后发放 `extra_credits`”，但正式生产还需要把订单持久化和额度发放做成数据库级幂等流程。

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

微信官方文档：

- [Native 支付产品介绍](https://pay.wechatpay.cn/doc/v3/merchant/4012791874)
- [微信支付结算账户与接入模式说明](https://pay.wechatpay.cn/doc/v3/partner/4012081931)
- [交易账单下载说明](https://pay.wechatpay.cn/doc/v2/merchant/4011987833)

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
