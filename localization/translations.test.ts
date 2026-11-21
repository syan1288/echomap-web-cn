import assert from 'node:assert/strict';
import test from 'node:test';
import { translations } from './translations.js';

test('avatar menu labels are translated in English and Chinese', () => {
  assert.deepEqual(
    {
      account: [translations.accountMenu.en, translations.accountMenu.zh],
      balance: [translations.versionPlanMenu.en, translations.versionPlanMenu.zh],
      model: [translations.modelMenu.en, translations.modelMenu.zh],
      logout: [translations.authSignOut.en, translations.authSignOut.zh],
    },
    {
      account: ['Account', '账户'],
      balance: ['Balance', '余额'],
      model: ['Model', '模型'],
      logout: ['Sign out', '退出登录'],
    }
  );
});

test('verification code actions use short bilingual labels and a compact countdown', () => {
  assert.deepEqual(
    {
      getCode: [translations.authGetCode.en, translations.authGetCode.zh],
      resend: [translations.authResend.en, translations.authResend.zh],
      countdown: [translations.authResendCodeIn.en, translations.authResendCodeIn.zh],
    },
    {
      getCode: ['Get code', '获取验证码'],
      resend: ['Resend', '重新发送'],
      countdown: ['{{seconds}}s', '{{seconds}}s'],
    },
  );
});

test('Balance flow labels are localized in English and Chinese', () => {
  assert.deepEqual(
    {
      balance: [translations.versionPlanMenu.en, translations.versionPlanMenu.zh],
      currentPlan: [translations.balanceCurrentPlan.en, translations.balanceCurrentPlan.zh],
      upgradePlan: [translations.balanceUpgradePlan.en, translations.balanceUpgradePlan.zh],
    },
    {
      balance: ['Balance', '余额'],
      currentPlan: ['Current plan', '当前套餐'],
      upgradePlan: ['Upgrade plan', '升级套餐'],
    },
  );
});
