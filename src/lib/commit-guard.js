/**
 * PinNote - Commit guard
 * Blocks commits/pushes whose added lines or file names match the vault's guard rules
 * (company names, API keys, .env secrets...). Rules live in .pinnote/guard.txt, which Git ignores.
 */

const DEFAULT_GUARD_RULES = `# PinNote commit guard
# Commits and pushes stop (until you confirm) when an added line or a file name matches a rule.
# One rule per line: a plain word (case-insensitive) or a /regular expression/flags.
# This file lives in .pinnote/, so it is never committed.

# Company and client names
nexon

# API keys and credentials
/api[_-]?key/i
/(secret|token|password|passwd)\\s*[:=]/i
/^\\s*(export\\s+)?[A-Z][A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)\\s*=/

# .env files
/(^|\\/)\\.env(\\.[\\w.-]+)?$/i

# Private keys and well-known token formats
/-----BEGIN [A-Z ]*PRIVATE KEY-----/
/AKIA[0-9A-Z]{16}/
/gh[pousr]_[A-Za-z0-9]{36,}/
/xox[baprs]-[A-Za-z0-9-]{10,}/
`;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @returns {{ rules: {source: string, re: RegExp}[], errors: string[] }}
 */
function parseRules(text) {
  const rules = [];
  const errors = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const regex = /^\/(.+)\/([a-z]*)$/.exec(line);
    try {
      // Flags never include g/y: those make RegExp.test stateful between lines
      const re = regex
        ? new RegExp(regex[1], regex[2].replace(/[gy]/g, ''))
        : new RegExp(escapeRegExp(line), 'i');
      rules.push({ source: line, re });
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

    const text = line.slice(1);
    const rule = rules.find(r => r.re.test(text));
    if (rule) findings.push({ file, line: lineNo, rule: rule.source, excerpt: excerptOf(text) });
    lineNo++;
  }
  return findings;
}

/** Flag file names that match a rule (e.g. ".env", "Nexon roadmap.md") */
function scanPaths(paths, rules) {
  return paths.flatMap((file) => {
    const rule = rules.find(r => r.re.test(file));
    return rule ? [{ file, line: null, rule: rule.source, excerpt: file }] : [];
  });
}

module.exports = { DEFAULT_GUARD_RULES, parseRules, scanDiff, scanPaths };
