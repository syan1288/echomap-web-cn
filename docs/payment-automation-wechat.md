# 微信支付 Native 自动开通方案

当前应用保留两种支付模式：

- `manual`：个人收款码或外部支付链接。用户付款后人工确认，再运行 `npm run grant:credits -- <userId> <credits>`。
- `wechat_native`：微信支付商户 Native。服务端创建微信订单，微信支付成功后通知 `/api/payments/wechat/notify`，服务端验签、解密、核对金额，并自动给用户加 `extraCredits`。

## 推荐上线顺序

1. 先保持 `ECHO_PAYMENT_PROVIDER=manual`，继续用当前收款码跑通付费意愿。
2. 准备微信支付商户号、API v3 密钥、商户私钥、平台公钥/证书。
3. 确认 `https://echomap.syan12.cn/api/payments/wechat/notify` 可以公网访问。
4. 切换 `ECHO_PAYMENT_PROVIDER=wechat_native`。
5. 用 1 笔小额真实支付验证：订单创建、微信回调、`logs/payment-orders.json` 状态变为 `confirmed`、`logs/entitlements.json` 增加 `extraCredits`。

## 腾讯云服务器环境变量

```bash
ECHO_PAYMENT_PROVIDER=wechat_native
ECHO_PAYMENT_ORDERS_PATH=/home/ubuntu/apps/echomap-web-cn/logs/payment-orders.json

ECHO_PLUS_PAYMENT_AMOUNT_CNY=5.9
ECHO_PLUS_PAYMENT_CREDITS=20
ECHO_PRO_PAYMENT_AMOUNT_CNY=11.9
ECHO_PRO_PAYMENT_CREDITS=40

WECHAT_PAY_APPID=wx...
WECHAT_PAY_MCHID=...
WECHAT_PAY_MERCHANT_SERIAL_NO=...
WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH=/home/ubuntu/apps/echomap-web-cn/secrets/wechatpay-apiclient-key.pem
WECHAT_PAY_NOTIFY_URL=https://echomap.syan12.cn/api/payments/wechat/notify
WECHAT_PAY_API_V3_KEY=32字节APIv3密钥
WECHAT_PAY_PLATFORM_SERIAL_NO=...
WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH=/home/ubuntu/apps/echomap-web-cn/secrets/wechatpay-platform-public-key.pem
```

不要把商户私钥、API v3 密钥、平台公钥文件提交到 git。服务器上建议放在 `/home/ubuntu/apps/echomap-web-cn/secrets/`，并限制权限：

```bash
mkdir -p /home/ubuntu/apps/echomap-web-cn/secrets
chmod 700 /home/ubuntu/apps/echomap-web-cn/secrets
chmod 600 /home/ubuntu/apps/echomap-web-cn/secrets/*.pem
```

## 当前实现

- 创建订单：`/api/payments/create-order`
  - `manual`：返回配置的 `ECHO_PLUS_PAYMENT_URL` / `ECHO_PRO_PAYMENT_URL`
  - `wechat_native`：请求微信支付 Native 下单接口，返回微信 `code_url`
- 支付通知：`/api/payments/wechat/notify`
  - 校验 `Wechatpay-*` 签名头
  - 使用 `WECHAT_PAY_API_V3_KEY` 解密通知资源
  - 只处理 `TRANSACTION.SUCCESS` + `trade_state=SUCCESS`
  - 按 `out_trade_no` 查订单，并核对支付金额
  - 确认后调用 `grantExtraCredits`
  - 重复通知不会重复加额度

## 生产注意

文件存储适合当前单机 Lighthouse 验证期。正式付费规模起来后，订单和额度建议切到数据库事务，避免“订单状态”和“额度授信”分属两个 JSON 文件导致极端情况下无法原子提交。

官方文档：

- [微信支付 Native 支付](https://pay.wechatpay.cn/doc/v3/merchant/4012791877)
- [微信支付通知处理](https://pay.wechatpay.cn/doc/v3/merchant/4012791882)
