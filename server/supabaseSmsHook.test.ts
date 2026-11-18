import assert from 'node:assert/strict';
import test from 'node:test';
import { Webhook } from 'standardwebhooks';
import { handleSupabaseSendSmsHook, type SupabaseSmsHookEnv } from './supabaseSmsHook.js';
import type { SendSmsInput } from './tencentSms.js';

const secret = Buffer.from('echo-map-send-sms-hook-secret-123').toString('base64');
const env: SupabaseSmsHookEnv = {
  SUPABASE_SEND_SMS_HOOK_SECRET: `v1,whsec_${secret}`,
};

async function signed(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const msgId = 'msg_test';
  const timestamp = new Date();
  const headers = {
    'webhook-id': msgId,
    'webhook-timestamp': `${Math.floor(timestamp.getTime() / 1000)}`,
    'webhook-signature': new Webhook(secret).sign(msgId, timestamp, rawBody),
  };
  return { rawBody, headers };
}

test('Supabase SMS hook verifies payload and sends normalized China phone', async () => {
  const event = await signed({
    user: { id: 'user_1', phone: '13812345678' },
    sms: { otp: '123456' },
  });
  let sent: SendSmsInput | null = null;

  const result = await handleSupabaseSendSmsHook(
    event.rawBody,
    event.headers,
    env,
    async (input) => {
      sent = input;
    }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {});
  assert.deepEqual(sent, { phone: '+8613812345678', otp: '123456', userId: 'user_1' });
});

test('Supabase SMS hook rejects invalid signature', async () => {
  const result = await handleSupabaseSendSmsHook(
    JSON.stringify({ user: { phone: '+8613812345678' }, sms: { otp: '123456' } }),
    { 'webhook-id': 'msg_1', 'webhook-timestamp': '1', 'webhook-signature': 'v1,bad' },
    env,
    async () => {}
  );

  assert.equal(result.status, 401);
  assert.match(String((result.body.error as { message?: string }).message), /Invalid Supabase SMS hook signature/);
});

test('Supabase SMS hook rejects non-China phone numbers', async () => {
  const event = await signed({
    user: { id: 'user_2', phone: '+14155550123' },
    sms: { otp: '123456' },
  });

  const result = await handleSupabaseSendSmsHook(event.rawBody, event.headers, env, async () => {});

  assert.equal(result.status, 400);
  assert.match(String((result.body.error as { message?: string }).message), /Only mainland China/);
});
