import tencentcloud from 'tencentcloud-sdk-nodejs';

export type TencentSmsEnv = {
  TENCENTCLOUD_SECRET_ID?: string;
  TENCENTCLOUD_SECRET_KEY?: string;
  TENCENT_SMS_REGION?: string;
  TENCENT_SMS_ENDPOINT?: string;
  TENCENT_SMS_SDK_APP_ID?: string;
  TENCENT_SMS_SIGN_NAME?: string;
  TENCENT_SMS_TEMPLATE_ID?: string;
  TENCENT_SMS_TEMPLATE_PARAMS?: string;
  TENCENT_SMS_OTP_TTL_MINUTES?: string;
  TENCENT_SMS_SESSION_PREFIX?: string;
};

export type SendSmsInput = {
  phone: string;
  otp: string;
  userId?: string;
};

export type SendSmsResult = {
  requestId?: string;
  code?: string;
  message?: string;
};

function required(env: TencentSmsEnv, key: keyof TencentSmsEnv): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function templateParams(input: SendSmsInput, env: TencentSmsEnv): string[] {
  const order = (env.TENCENT_SMS_TEMPLATE_PARAMS || 'otp')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return order.map((item) => {
    if (item === 'otp') return input.otp;
    if (item === 'ttl') return env.TENCENT_SMS_OTP_TTL_MINUTES?.trim() || '5';
    return item;
  });
}

export async function sendTencentSmsOtp(
  input: SendSmsInput,
  env: TencentSmsEnv = process.env
): Promise<SendSmsResult> {
  const secretId = required(env, 'TENCENTCLOUD_SECRET_ID');
  const secretKey = required(env, 'TENCENTCLOUD_SECRET_KEY');
  const smsSdkAppId = required(env, 'TENCENT_SMS_SDK_APP_ID');
  const signName = required(env, 'TENCENT_SMS_SIGN_NAME');
  const templateId = required(env, 'TENCENT_SMS_TEMPLATE_ID');

  const SmsClient = tencentcloud.sms.v20210111?.Client || tencentcloud.sms.v20190711.Client;
  const client = new SmsClient({
    credential: {
      secretId,
      secretKey,
    },
    region: env.TENCENT_SMS_REGION?.trim() || 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: env.TENCENT_SMS_ENDPOINT?.trim() || 'sms.tencentcloudapi.com',
      },
    },
  });

  const response = await (client as any).SendSms({
    SmsSdkAppId: smsSdkAppId,
    SignName: signName,
    TemplateId: templateId,
    PhoneNumberSet: [input.phone],
    TemplateParamSet: templateParams(input, env),
    SessionContext: `${env.TENCENT_SMS_SESSION_PREFIX?.trim() || 'supabase-auth'}:${input.userId || 'anonymous'}`,
  });

  const status = response?.SendStatusSet?.[0];
  if (status?.Code && status.Code !== 'Ok') {
    throw new Error(`${status.Code}: ${status.Message || 'Tencent SMS send failed'}`);
  }

  return {
    requestId: response?.RequestId,
    code: status?.Code,
    message: status?.Message,
  };
}
