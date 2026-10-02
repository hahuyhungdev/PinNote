/**
 * PinNote - Commit guard
 * Blocks commits/pushes whose added lines or file names match the vault's guard rules
 * (company names, API keys, .env secrets...). Rules live in .pinnote/guard.txt, which Git ignores.
 */

const DEFAULT_GUARD_RULES = `# PinNote commit guard
# Commits and pushes stop (until you confirm) when an added line, a file name or the commit
# author matches a rule. One rule per line: a plain word/phrase (case-insensitive) or a
# /regular expression/flags. This file lives in .pinnote/, so it is never committed.

# Company and client names
nexon

# Confidentiality labels
/\\bconfidential\\b/i
/\\binternal[ -]only\\b/i
/\\bdo not (share|distribute)\\b/i
/\\bNDA\\b/
bảo mật
nội bộ
mật khẩu

# Credentials: key, secret, password and token assignments
/api[_-]?key/i
/\\b(secret|client[_-]?secret|token|access[_-]?token|password|passwd|pwd)\\s*[:=]/i
/^\\s*(export\\s+)?[A-Z][A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)\\s*=/
/\\bBearer\\s+[A-Za-z0-9._~+\\/-]{20,}/
/\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}/
/\\b[a-z][a-z0-9+.-]*:\\/\\/[^\\s:@\\/]+:[^\\s@\\/]+@/i

# .env files
/(^|\\/)\\.env(\\.[\\w.-]+)?$/i

# Private keys and provider key formats (AWS, GitHub, Slack, OpenAI, Stripe, Google)
/-----BEGIN [A-Z ]*PRIVATE KEY-----/
/\\bAKIA[0-9A-Z]{16}\\b/
/\\bgh[pousr]_[A-Za-z0-9]{36,}/
/\\bxox[baprs]-[A-Za-z0-9-]{10,}/
/\\bsk-(proj-)?[A-Za-z0-9_-]{20,}/
/\\bsk_live_[A-Za-z0-9]{16,}/
/\\bAIza[0-9A-Za-z_-]{35}\\b/

# Internal network addresses
/\\b(10\\.\\d{1,3}|192\\.168|172\\.(1[6-9]|2\\d|3[01]))\\.\\d{1,3}\\.\\d{1,3}\\b/

# Personal data: Vietnamese mobile numbers
/(^|\\D)(\\+84|0)[35789]\\d{8}(?!\\d)/

# Optional (noisy) — delete the leading "# " to turn on:
# /[\\w.+-]+@[\\w-]+\\.[\\w.-]+/
# /\\b(?:\\d[ -]?){13,16}\\b/
`;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Each rule gets a readable `label`: a plain word shows itself; a regex shows the comment
 * heading directly above its block (or its own source when there is none).
 * @returns {{ rules: {source: string, label: string, re: RegExp}[], errors: string[] }}
 */
function parseRules(text) {
  const rules = [];
  const errors = [];
  let heading = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    // NFC so Vietnamese rules match however the text was composed
    const line = raw.trim().normalize('NFC');
    if (!line) {
      heading = null;
      continue;
    }
    if (line.startsWith('#')) {
      const comment = line.replace(/^#+\s*/, '');
      // Commented-out rules are not headings
      if (comment && !comment.startsWith('/')) heading = comment;
      continue;
    }
    const regex = /^\/(.+)\/([a-z]*)$/.exec(line);
    try {
      // Flags never include g/y: those make RegExp.test stateful between lines
      const re = regex
        ? new RegExp(regex[1], regex[2].replace(/[gy]/g, ''))
        : new RegExp(escapeRegExp(line), 'i');
      rules.push({ source: line, label: regex ? (heading || line) : `"${line}"`, re });
    } catch (err) {
      errors.push(`${line}: ${err.message}`);
    }
  }
  return { rules, errors };
}

const excerptOf = (text) => {
  const trimmed = text.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
};

/**
 * Scan the added lines of a unified diff (git diff -U0)
 * @returns {{file: string, line: number, rule: string, excerpt: string}[]}
 */
function scanDiff(diffText, rules) {
  const findings = [];
  let file = null;
  let lineNo = 0;

  for (const line of String(diffText ?? '').split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.slice(4).replace(/^b\//, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (!file || !line.startsWith('+')) continue;

    const text = line.slice(1).normalize('NFC');
    const rule = rules.find(r => r.re.test(text));
    if (rule) findings.push({ file, line: lineNo, rule: rule.source, label: rule.label, excerpt: excerptOf(text) });
    lineNo++;
  }
  return findings;
}

/** Flag file names that match a rule (e.g. ".env", "Nexon roadmap.md") */
function scanPaths(paths, rules) {
  return paths.flatMap((file) => {
    const rule = rules.find(r => r.re.test(file.normalize('NFC')));
    return rule ? [{ file, line: null, rule: rule.source, label: rule.label, excerpt: file }] : [];
  });
}

module.exports = { DEFAULT_GUARD_RULES, parseRules, scanDiff, scanPaths };
