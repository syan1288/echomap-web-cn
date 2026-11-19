import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaymentOrder, listPaymentPlans, type PaymentEnv } from './paymentOrders.js';

function testEnv(dir: string, overrides: Partial<PaymentEnv> = {}): PaymentEnv {
  return {
    ECHO_PAYMENT_ORDERS_PATH: path.join(dir, 'payment-orders.json'),
    ECHO_PLUS_PAYMENT_URL: 'https://pay.example.com/plus',
    ECHO_PRO_PAYMENT_URL: 'https://pay.example.com/pro',
    ...overrides,
  };
}

test('listPaymentPlans exposes configured manual payment plans', () => {
  const plans = listPaymentPlans(testEnv('unused'));

  assert.deepEqual(
    plans.map((plan) => ({
      id: plan.id,
      amountCny: plan.amountCny,
      credits: plan.credits,
      enabled: plan.enabled,
    })),
    [
      { id: 'plus', amountCny: 5, credits: 20, enabled: true },
      { id: 'pro', amountCny: 12.9, credits: 60, enabled: true },
    ]
  );
});

test('createPaymentOrder writes a pending manual order', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-orders-'));
  try {
    const order = await createPaymentOrder(
      {
        userId: 'user_payment',
        planId: 'plus',
        contact: 'buyer@example.com',
      },
      testEnv(dir)
    );

    assert.match(order.id, /^pay_\d+_[a-z0-9]+$/);
    assert.equal(order.userId, 'user_payment');
    assert.equal(order.planId, 'plus');
    assert.equal(order.status, 'pending_manual_confirmation');
    assert.equal(order.credits, 20);
    assert.equal(order.paymentUrl, 'https://pay.example.com/plus');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createPaymentOrder rejects disabled or unknown plans', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-orders-'));
  try {
    await assert.rejects(
      () => createPaymentOrder({ userId: 'user_payment', planId: 'plus' }, testEnv(dir, { ECHO_PLUS_PAYMENT_URL: '' })),
      /not available/
    );
    await assert.rejects(
      () => createPaymentOrder({ userId: 'user_payment', planId: 'enterprise' }, testEnv(dir)),
      /unknown plan/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
