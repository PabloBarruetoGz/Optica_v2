import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { auth } from './auth.js';
import { pool } from './db.js';
function hiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Ejecuta este comando en una terminal interactiva.');
  process.stdout.write('Contraseña (mínimo 12 caracteres, no se mostrará): ');
  return new Promise((resolve, reject) => {
    let password = '';
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    function cleanup() { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); }
    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === '\u0003') { cleanup(); reject(new Error('Operación cancelada.')); return; }
        if (char === '\r' || char === '\n') { cleanup(); resolve(password); return; }
        if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
        else if (char >= ' ') password += char;
      }
    }
    process.stdin.on('data', onData);
  });
}
try {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const email = z.email().parse(values.email || await reader.question('Correo del administrador: ')).toLowerCase();
  const name = z.string().trim().min(2).max(150).parse(values.name || await reader.question('Nombre: '));
  reader.close();
  if ((await pool.query('SELECT 1 FROM "user" WHERE lower(email) = $1', [email])).rowCount) throw new Error('Ese correo ya existe. Usa un correo nuevo o solicita el cambio a un administrador.');
  const password = z.string().min(12).max(128).parse(await hiddenPassword());
  const created = await auth.api.signUpEmail({ body: { email, name, password } });
  await pool.query('UPDATE "user" SET role = $1, "updatedAt" = now() WHERE id = $2', ['admin', created.user.id]);
  await pool.query('DELETE FROM session WHERE "userId" = $1', [created.user.id]);
  console.log(`Administrador creado: ${email}. Inicia sesión en /cuenta.`);
} catch (error) {
  console.error(error instanceof z.ZodError ? 'Datos inválidos: usa un correo válido, nombre de al menos 2 caracteres y contraseña de 12 a 128 caracteres.' : error instanceof Error ? error.message : 'No se pudo crear el administrador.');
  process.exitCode = 1;
} finally { await pool.end(); }
