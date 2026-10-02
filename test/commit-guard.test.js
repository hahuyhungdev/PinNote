const { test } = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_GUARD_RULES, parseRules, scanDiff, scanPaths } = require('../src/lib/commit-guard');

const matches = (text, rulesText = DEFAULT_GUARD_RULES) =>
  parseRules(rulesText).rules.some(r => r.re.test(text));

test('parseRules reads words and /regex/ lines, skipping comments and reporting bad patterns', () => {
  const { rules, errors } = parseRules('# comment\n\nnexon\nfoo.bar\n/api[_-]?key/i\n/unclosed(/\n');
  assert.deepEqual(rules.map(r => r.source), ['nexon', 'foo.bar', '/api[_-]?key/i']);
  assert.equal(rules[0].re.test('Talked to NEXON today'), true, 'words are case-insensitive');
  assert.equal(rules[1].re.test('fooXbar'), false, 'words are literal, not regex');
  assert.equal(rules[1].re.test('see foo.bar'), true);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /unclosed/);
});

test('scanDiff reports added lines with file and new line number, ignoring removed and context lines', () => {
  const diff = [
    'diff --git a/Work/Meeting.md b/Work/Meeting.md',
    'index 1..2 100644',
    '--- a/Work/Meeting.md',
    '+++ b/Work/Meeting.md',
    '@@ -3,0 +4,2 @@',
    '+Call with Nexon about pricing',
    '+nothing here',
    '@@ -10 +12 @@',
    '-old nexon line',
    '+apiKey = "abc123"',
    'diff --git a/New.md b/New.md',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/New.md',
    '@@ -0,0 +1 @@',
    '+clean note'
  ].join('\n');
  const findings = scanDiff(diff, parseRules('nexon\n/api[_-]?key/i').rules);
  assert.deepEqual(findings.map(f => [f.file, f.line, f.rule]), [
    ['Work/Meeting.md', 4, 'nexon'],
    ['Work/Meeting.md', 12, '/api[_-]?key/i']
  ]);
  assert.equal(findings[0].excerpt, 'Call with Nexon about pricing');
});

test('scanPaths flags secret-looking file names', () => {
  const { rules } = parseRules(DEFAULT_GUARD_RULES);
  assert.deepEqual(scanPaths(['.env', 'config/.env.local', 'notes/env.md', 'Nexon roadmap.md'], rules).map(f => f.file),
    ['.env', 'config/.env.local', 'Nexon roadmap.md']);
});

test('default rules catch common secrets and company names', () => {
  for (const secret of [
    'nexon internal roadmap',
    'apiKey: 123456',
    'api_key=abc',
    'OPENAI_API_KEY=sk-live-abc',
    'export DB_PASSWORD=hunter2',
    'password = hunter2',
    'token: eyJhbGciOi',
    '-----BEGIN RSA PRIVATE KEY-----',
    'AKIAIOSFODNN7EXAMPLE',
    'ghp_0123456789abcdefghijklmnopqrstuvwxyzAB'
  ]) {
    assert.equal(matches(secret), true, secret);
  }
});

test('default rules leave ordinary notes alone', () => {
  for (const plain of [
    'I learned about environment variables today',
    'The key idea of the talk',
    'Tokenization in NLP',
    'Reset my password next week',
    'Use a .env file for local settings'
  ]) {
    assert.equal(matches(plain), false, plain);
  }
});
