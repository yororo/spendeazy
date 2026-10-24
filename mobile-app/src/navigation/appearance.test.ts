import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAppearancePreference,
  resolveColorScheme,
} from './appearance.ts';

test('defaults an unknown stored Appearance to System', () => {
  assert.equal(parseAppearancePreference(null), 'system');
  assert.equal(parseAppearancePreference('sepia'), 'system');
  assert.equal(parseAppearancePreference('dark'), 'dark');
});

test('System follows the device appearance', () => {
  assert.equal(resolveColorScheme('system', 'dark'), 'dark');
  assert.equal(resolveColorScheme('system', 'light'), 'light');
  assert.equal(resolveColorScheme('system', null), 'light');
});

test('an explicit Appearance overrides the device', () => {
  assert.equal(resolveColorScheme('light', 'dark'), 'light');
  assert.equal(resolveColorScheme('dark', 'light'), 'dark');
});
