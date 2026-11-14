import { betterAuth } from 'better-auth';
import { pool } from './db.js';
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error('Falta BETTER_AUTH_SECRET. Ejecuta npm run dev desde la raíz para preparar el entorno.');
}
export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
export const auth = betterAuth({
  appName: 'Óptica Duhalde',
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://127.0.0.1:5186',
  trustedOrigins: [process.env.BETTER_AUTH_URL || 'http://127.0.0.1:5186', ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5186'])],
  socialProviders: googleEnabled ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: 'select_account' } } : {},
  account: { encryptOAuthTokens: true, accountLinking: { enabled: true, allowDifferentEmails: false } },
  emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
  user: { additionalFields: { role: { type: 'string', defaultValue: 'client', required: true, input: false } } },
  advanced: { ipAddress: { ipAddressHeaders: ['x-real-ip'] } },
  session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
  rateLimit: { enabled: true, window: 60, max: 30, storage: process.env.NODE_ENV === 'test' ? 'memory' : 'database' },
});
