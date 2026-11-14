import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { app } from './app.js';
import { pool } from './db.js';

test('registro, sesiones y permisos de los dos perfiles', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const origin = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:5186';
  const ids: string[] = [];
  const password = randomBytes(24).toString('base64url');
  async function call(path: string, method = 'GET', body?: unknown, cookie?: string, requestOrigin = origin) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const cookieOf = (r: Response) => r.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  try {
    assert.equal((await call('/admin/users')).status, 401);
    const profiles = await pool.query('SELECT code FROM profiles ORDER BY code');
    assert.deepEqual(profiles.rows.map(row => row.code), ['admin', 'client']);
    const clientEmail = `qa-client-${randomUUID()}@example.com`;
    const signup = await call('/auth/sign-up/email', 'POST', { name: 'Cliente de prueba', email: clientEmail, password, role: 'admin' });
    assert.equal(signup.status, 200);
    const registered = await signup.json(); ids.push(registered.user.id);
    assert.equal(registered.user.role, 'client', 'el registro no permite autoasignarse Administrador');
    const clientCookie = cookieOf(signup);
    assert.ok(clientCookie);
    const profile = await (await call('/me', 'GET', undefined, clientCookie)).json();
    assert.equal(profile.profile.name, 'Cliente');
    assert.equal((await call('/admin/users', 'GET', undefined, clientCookie)).status, 403);
    assert.equal((await call('/admin/inquiries', 'GET', undefined, clientCookie)).status, 403);
    await call('/auth/update-user', 'POST', { name: 'Nombre actualizado', role: 'admin' }, clientCookie);
    assert.equal((await pool.query('SELECT role FROM "user" WHERE id = $1', [ids[0]])).rows[0].role, 'client');
    const email = `qa-admin-${randomUUID()}@example.com`;
    const adminSignup = await call('/auth/sign-up/email', 'POST', { name: 'Administrador de prueba', email, password });
    assert.equal(adminSignup.status, 200);
    const adminUser = await adminSignup.json(); ids.push(adminUser.user.id);
    await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', ['admin', ids[1]]);
    const adminCookie = cookieOf(adminSignup);
    const listing = await call('/admin/users', 'GET', undefined, adminCookie);
    assert.equal(listing.status, 200);
    const list = await listing.json();
    assert.ok(list.users.some((u: { id: string }) => u.id === ids[0]));
    assert.ok(list.users.every((u: Record<string, unknown>) => !('password' in u) && !('token' in u)));
    assert.equal((await call('/admin/inquiries', 'GET', undefined, adminCookie)).status, 200);
    assert.equal((await call(`/admin/users/${ids[0]}/role`, 'PATCH', { role: 'owner' }, adminCookie)).status, 400);
    assert.equal((await call(`/admin/users/${ids[1]}/role`, 'PATCH', { role: 'client' }, adminCookie)).status, 409);
    assert.equal((await call(`/admin/users/${ids[0]}/role`, 'PATCH', { role: 'admin' }, adminCookie, 'https://otro-sitio.example')).status, 403);
    const promotion = await call(`/admin/users/${ids[0]}/role`, 'PATCH', { role: 'admin' }, adminCookie);
    assert.equal(promotion.status, 200);
    assert.equal((await call('/me', 'GET', undefined, clientCookie)).status, 401, 'cambiar rol invalida sesiones anteriores');
    const login = await call('/auth/sign-in/email', 'POST', { email: clientEmail, password });
    assert.equal(login.status, 200);
    const newCookie = cookieOf(login);
    assert.equal((await call('/admin/users', 'GET', undefined, newCookie)).status, 200);
    assert.equal((await call('/auth/sign-out', 'POST', {}, newCookie)).status, 200);
    assert.equal((await call('/me', 'GET', undefined, newCookie)).status, 401);
    const account = await pool.query('SELECT password FROM account WHERE "userId" = $1', [ids[0]]);
    assert.ok(account.rows[0].password && account.rows[0].password !== password);
  } finally {
    await pool.query('DELETE FROM session WHERE "userId" = ANY($1::text[])', [ids]);
    await pool.query('DELETE FROM account WHERE "userId" = ANY($1::text[])', [ids]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [ids]);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
