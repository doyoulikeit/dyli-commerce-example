import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbiddenPath = /(^|\/)(\.env(?!\.example$)[^/]*|\.vercel|node_modules|\.next|backups?|private-audit|AGENTS\.md|CLAUDE\.md)(\/|$)|\.(pem|key|p12|pfx|bundle|zip|bak)$/i;
const secrets = [
  /dyli_(?:live|test)_[A-Za-z0-9_-]{20,}/,
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/,
  /AIza[A-Za-z0-9_-]{30,}/,
  /(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /alchemy\.com\/v2\/[A-Za-z0-9_-]{16,}/,
];
const findings = [];
for (const file of files) {
  if (forbiddenPath.test(file) || /^docs\/internal\//i.test(file)) findings.push(`${file}: excluded path`);
  if (/\.(png|ico|webp|jpg|jpeg|woff2?)$/i.test(file)) continue;
  const content = readFileSync(file, 'utf8');
  if (secrets.some(pattern => pattern.test(content))) findings.push(`${file}: possible credential (value hidden)`);
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else console.log(`PASS ${files.length} tracked paths checked; no excluded files or known credential patterns.`);
