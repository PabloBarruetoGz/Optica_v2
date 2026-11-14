import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

// Test credentials exist only in this isolated test process, never in .env.
process.env.GOOGLE_CLIENT_ID = 'test-optica-google.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-only-google-client-secret';
const { app } = await import('./app.js');
const { pool } = await import('./db.js');

test('Google OAuth guarda el Cliente, mantiene roles y reutiliza la cuenta', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const origin = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:5186';
  const email = `qa-google-${randomUUID()}@example.com`;
  const subject = randomUUID();
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-google-key', alg: 'RS256', use: 'sig' };
  const token = await new SignJWT({ email, email_verified: true, name: 'Cliente Google prueba', role: 'admin' })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer('https://accounts.google.com')
    .setAudience(process.env.GOOGLE_CLIENT_ID!).setSubject(subject).setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const originalFetch = globalThis.fetch;
  let exchanges = 0;
  const fetchMock = mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
    const resource = args[0];
    const url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url;
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    if (url === 'https://oauth2.googleapis.com/token') {
      exchanges++;
      const body = String(args[1]?.body ?? '');
      assert.ok(body.includes('code_verifier='), 'el intercambio incluye PKCE');
      return Response.json({ access_token: 'test-token', token_type: 'Bearer', expires_in: 3600, id_token: token });
    }
    return originalFetch(...args);
  });
  const cookies = (r: Response) => r.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  async function login() {
    const start = await fetch(`${base}/auth/sign-in/social`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ provider: 'google', callbackURL: '/cuenta', disableRedirect: true }) });
    assert.equal(start.status, 200);
    const url = new URL((await start.json()).url);
    assert.equal(url.hostname, 'accounts.google.com');
    assert.equal(url.searchParams.get('redirect_uri'), `${origin}/api/auth/callback/google`);
    assert.ok(url.searchParams.get('code_challenge'));
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('prompt'), 'select_account');
    assert.deepEqual(new Set(url.searchParams.get('scope')!.split(' ')), new Set(['email', 'profile', 'openid']));
    const state = url.searchParams.get('state'); assert.ok(state);
    const callback = await fetch(`${base}/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`, { headers: { Cookie: cookies(start) }, redirect: 'manual' });
    assert.equal(callback.status, 302);
    assert.ok(callback.headers.get('location')?.endsWith('/cuenta'), 'regresa a Mi cuenta');
    const cookie = cookies(callback);
    const me = await fetch(`${base}/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    return { data: await me.json(), cookie };
  }
  try {
    const first = await login();
    assert.equal(first.data.user.email, email);
    assert.equal(first.data.user.role, 'client', 'Google no puede asignar Administrador mediante claims');
    const account = await pool.query('SELECT "providerId", "accountId", password FROM account WHERE "userId" = $1', [first.data.user.id]);
    assert.equal(account.rows[0].providerId, 'google');
    assert.equal(account.rows[0].accountId, subject);
    assert.equal(account.rows[0].password, null);
    const second = await login();
    assert.equal(second.data.user.id, first.data.user.id);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM "user" WHERE email = $1', [email])).rows[0].total, 1);
    await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', ['admin', first.data.user.id]);
    assert.equal((await login()).data.user.role, 'admin', 'el reingreso respeta el rol existente');
    const previousExchanges = exchanges;
    await fetch(`${base}/auth/callback/google?code=test-code&state=invalid-state`, { redirect: 'manual' });
    assert.equal(exchanges, previousExchanges, 'un estado inválido no intercambia el código');
  } finally {
    fetchMock.mock.restore();
    const users = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
    for (const user of users.rows) {
      await pool.query('DELETE FROM session WHERE "userId" = $1', [user.id]);
      await pool.query('DELETE FROM account WHERE "userId" = $1', [user.id]);
      await pool.query('DELETE FROM "user" WHERE id = $1', [user.id]);
    }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
