import { ensureEnv } from './ensure-env.mjs';
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
ensureEnv();
config({ path: '.env', quiet: true });
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) { console.error('No se pudo preparar el entorno. Revisa Docker o DATABASE_URL en v2/.env.'); process.exit(1); }
}
if (process.env.SKIP_DOCKER !== 'true') run('docker', ['compose', 'up', '-d', '--wait', 'db']);
run('npm', ['run', 'db:migrate']);
