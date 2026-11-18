import { Webhook } from 'standardwebhooks';
import { sendTencentSmsOtp, type SendSmsInput, type TencentSmsEnv } from './tencentSms.js';

export type SupabaseSmsHookEnv = TencentSmsEnv & {
  SUPABASE_SEND_SMS_HOOK_SECRET?: string;
};

export type SupabaseSmsHookResult = {
  status: number;
  body: Record<string, unknown>;
};

export type SmsSender = (input: SendSmsInput, env: SupabaseSmsHookEnv) => Promise<unknown>;

type SmsHookPayload = {
  user?: {
    id?: unknown;
    phone?: unknown;
  };
  sms?: {
    otp?: unknown;
  };
};

function hookSecret(env: SupabaseSmsHookEnv): string {
  const raw = env.SUPABASE_SEND_SMS_HOOK_SECRET?.trim();
  if (!raw) throw new Error('SUPABASE_SEND_SMS_HOOK_SECRET is required');
  return raw.replace(/^v1,whsec_/, '');
}

function toHeaderRecord(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
  }
  return out;
}

function runtimeError(status: number, message: string): SupabaseSmsHookResult {
  return {
    status,
    body: {
      error: {
        http_code: status,
        message,
      },
    },
  };
}

function parsePayload(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  env: SupabaseSmsHookEnv
): SmsHookPayload {
  const wh = new Webhook(hookSecret(env));
  return wh.verify(rawBody, toHeaderRecord(headers)) as SmsHookPayload;
}

function normalizeChinaPhone(phone: string): string {
  const compact = phone.trim().replace(/[\s()-]/g, '');
  if (compact.startsWith('+86') && /^(\+86)1\d{10}$/.test(compact)) return compact;
  if (compact.startsWith('+')) {
    throw new Error('Only mainland China phone numbers are supported by this SMS hook');
  }

  const digits = compact.replace(/\D/g, '');
  if (/^1\d{10}$/.test(digits)) return `+86${digits}`;
  if (/^86\d{11}$/.test(digits)) return `+${digits}`;

  throw new Error('Only mainland China phone numbers are supported by this SMS hook');
}

export async function handleSupabaseSendSmsHook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  env: SupabaseSmsHookEnv = process.env,
  sender: SmsSender = sendTencentSmsOtp
): Promise<SupabaseSmsHookResult> {
  let payload: SmsHookPayload;
  try {
    payload = parsePayload(rawBody, headers, env);
  } catch {
    return runtimeError(401, 'Invalid Supabase SMS hook signature');
  }

  const rawPhone = typeof payload.user?.phone === 'string' ? payload.user.phone : '';
  const otp = typeof payload.sms?.otp === 'string' ? payload.sms.otp.trim() : '';
  const userId = typeof payload.user?.id === 'string' ? payload.user.id : undefined;

  if (!rawPhone) return runtimeError(400, 'Supabase SMS hook payload is missing user.phone');
  if (!otp) return runtimeError(400, 'Supabase SMS hook payload is missing sms.otp');

  let phone: string;
  try {
    phone = normalizeChinaPhone(rawPhone);
  } catch (error) {
    return runtimeError(400, error instanceof Error ? error.message : 'Invalid phone number');
  }

  try {
    await sender({ phone, otp, userId }, env);
    return { status: 200, body: {} };
  } catch (error) {
    return runtimeError(502, error instanceof Error ? error.message : 'Unable to send SMS OTP');
  }
}
