# 微信支付 Native 自动开通方案

当前应用保留三种支付模式：

- `manual`：个人收款码或外部支付链接。用户付款后人工确认，再运行 `npm run grant:credits -- <userId> <credits>`。
- `wechat_native`：微信支付商户 Native。服务端创建微信订单，微信支付成功后通知 `/api/payments/wechat/notify`，服务端验签、解密、核对金额，并自动给用户加 `extraCredits`。

## 推荐上线顺序

1. 先保持 `ECHO_PAYMENT_PROVIDER=manual`，继续用当前收款码跑通付费意愿。
2. 准备微信支付商户号、API v3 密钥、商户私钥、平台公钥/证书。
3. 确认 `https://echomap.syan12.cn/api/payments/wechat/notify` 可以公网访问。
4. 切换 `ECHO_PAYMENT_PROVIDER=wechat_native`。
5. 用 1 笔小额真实支付验证：订单创建、微信回调、`payment_orders` 状态变为 `confirmed`、`echo_entitlements.extra_credits` 增加，并检查 `credit_ledger` 写入一条 `grant` 流水。

## Vercel Production 环境变量

生产项目：

```text
https://vercel.com/syan1288s-projects/echo-map/settings/environment-variables
```

微信私钥、API v3 密钥和平台公钥必须作为 Vercel Secret 保存；不要提交到 GitHub，也不要放进前端变量。

```bash
ECHO_PAYMENT_PROVIDER=wechat_native
ECHO_ENTITLEMENTS_STORE=supabase
ECHO_PAYMENT_ORDERS_STORE=supabase
ECHO_ENTITLEMENTS_TABLE=echo_entitlements

ECHO_PLUS_PAYMENT_AMOUNT_CNY=5.9
ECHO_PLUS_PAYMENT_CREDITS=20
ECHO_PRO_PAYMENT_AMOUNT_CNY=11.9
ECHO_PRO_PAYMENT_CREDITS=40

WECHAT_PAY_APPID=wx...
WECHAT_PAY_MCHID=...
WECHAT_PAY_MERCHANT_SERIAL_NO=...
WECHAT_PAY_MERCHANT_PRIVATE_KEY=...
WECHAT_PAY_NOTIFY_URL=https://echomap.syan12.cn/api/payments/wechat/notify
WECHAT_PAY_API_V3_KEY=32字节APIv3密钥
WECHAT_PAY_PLATFORM_SERIAL_NO=...
WECHAT_PAY_PLATFORM_PUBLIC_KEY=...
```

如果不想把 PEM 内容直接写进环境变量，也可以使用 `WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH` 和 `WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH`，但 Vercel Serverless 不适合依赖本地持久文件，生产优先使用 Secret 环境变量。

## 当前实现

- 创建订单：`/api/payments/create-order`
  - `manual`：返回配置的 `ECHO_PLUS_PAYMENT_URL` / `ECHO_PRO_PAYMENT_URL`
  - `wechat_native`：请求微信支付 Native 下单接口，返回微信 `code_url`
- 支付通知：`/api/payments/wechat/notify`
  - 校验 `Wechatpay-*` 签名头
  - 使用 `WECHAT_PAY_API_V3_KEY` 解密通知资源
  - 只处理 `TRANSACTION.SUCCESS` + `trade_state=SUCCESS`
  - 按 `out_trade_no` 查订单，并核对支付金额
  - 确认后通过 Supabase 事务函数写入订单、`echo_entitlements` 和 `credit_ledger`
  - 重复通知不会重复加额度

## 生产注意

生产必须先执行：

```text
supabase/002_entitlements.sql
supabase/003_payment_orders_and_credit_ledger.sql
supabase/005_balance_and_purchased_plan.sql
```

Vercel 上必须同时使用：

```text
ECHO_ENTITLEMENTS_STORE=supabase
ECHO_PAYMENT_ORDERS_STORE=supabase
```

切换 provider 前，先用一笔小额真实订单验证创建订单、微信回调验签、订单确认、额度增加和重复回调幂等。当前生产尚未配置 `WECHAT_PAY_*`，因此还不能宣称微信支付已经上线。

官方文档：

- [微信支付 Native 支付](https://pay.wechatpay.cn/doc/v3/merchant/4012791877)
- [微信支付通知处理](https://pay.wechatpay.cn/doc/v3/merchant/4012791882)
