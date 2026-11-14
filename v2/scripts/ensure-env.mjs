import { readFileSync, writeFileSync, copyFileSync, existsSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
export function ensureEnv() {
  if (!existsSync('.env')) copyFileSync('.env.example', '.env');
  let content = readFileSync('.env', 'utf8');
  if (!/^BETTER_AUTH_SECRET=.+$/m.test(content)) {
    content = content.replace(/^BETTER_AUTH_SECRET=.*\n?/m, '');
    content += `\nBETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`;
  }
  if (!/^BETTER_AUTH_URL=.+$/m.test(content)) content += '\nBETTER_AUTH_URL=http://127.0.0.1:5186\n';
  writeFileSync('.env', content, { mode: 0o600 });
  chmodSync('.env', 0o600);
}
