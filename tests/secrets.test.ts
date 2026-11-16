import { expect, test } from 'vitest';
import { hasPlaceholder, replaceSecrets, restoreSecrets } from '../src/lib/secrets';

test('requirepass value is replaced by an env placeholder and remembered in memory', () => {
  const result = replaceSecrets('requirepass "s3cr3t"\n');
  expect(result.text).toBe('requirepass ${env_requirepass}\n');
  expect(result.found).toBe(1);
  expect(restoreSecrets(result.text, result.vault)).toBe('requirepass "s3cr3t"\n');
});

test('masterauth and tls key pass are covered too', () => {
  const result = replaceSecrets('masterauth oldpass\ntls-key-file-pass "k"\n');
  expect(result.text).toContain('${env_masterauth}');
  expect(result.text).toContain('${env_tls-key-file-pass}');
});

test('acl user passwords are replaced but the username is kept', () => {
  const result = replaceSecrets('user default on >mypass ~* &* +@all\n');
  expect(result.text.startsWith('user default on ${env_user-pass}')).toBe(true);
  expect(result.text).not.toContain('mypass');
});

test('running twice does not double-replace', () => {
  const once = replaceSecrets('requirepass a\n').text;
  expect(replaceSecrets(once).found).toBe(0);
});

test('detects placeholders for the export menu', () => {
  expect(hasPlaceholder('masterauth ${env_masterauth}\n')).toBe(true);
  expect(hasPlaceholder('maxmemory 0\n')).toBe(false);
});
