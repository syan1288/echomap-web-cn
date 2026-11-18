import assert from 'node:assert/strict';
import test from 'node:test';
import { translations } from './translations.js';

test('avatar menu labels are translated in English and Chinese', () => {
  assert.deepEqual(
    {
      account: [translations.accountMenu.en, translations.accountMenu.zh],
      version: [translations.versionPlanMenu.en, translations.versionPlanMenu.zh],
      model: [translations.modelMenu.en, translations.modelMenu.zh],
      logout: [translations.authSignOut.en, translations.authSignOut.zh],
    },
    {
      account: ['Account', '账户'],
      version: ['Version Plan', '版本方案'],
      model: ['Model', '模型'],
      logout: ['Sign out', '退出登录'],
    }
  );
});
