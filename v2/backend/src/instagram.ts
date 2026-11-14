import { Router } from 'express';
import { z } from 'zod';
import { pool } from './db.js';
import { auth } from './auth.js';
import { requireAdmin } from './profiles.js';
export const instagramRouter = Router();
export const instagramPost = z.string().trim().max(500).transform((value, ctx) => {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/(?:[A-Za-z0-9_.]+\/)?(p|reel)\/([A-Za-z0-9_-]+)\/?$/);
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port || !match) throw new Error();
    return `https://www.instagram.com/${match[1]}/${match[2]}/`;
  } catch { ctx.addIssue({ code: 'custom', message: 'Usa el enlace HTTPS de una publicación o reel de Instagram.' }); return z.NEVER; }
});
export const instagramSettings = z.object({ enabled: z.boolean(), posts: z.array(instagramPost).max(12) }).strict().refine(data => new Set(data.posts).size === data.posts.length, 'No repitas publicaciones.');
async function settings() {
  return (await pool.query('SELECT enabled, posts FROM instagram_section WHERE id = 1')).rows[0];
}
instagramRouter.get('/instagram', async (_req, res) => {
  const data = await settings();
  res.set('Cache-Control', 'no-store').json({ enabled: data.enabled, posts: data.enabled ? data.posts : [], profile: 'https://www.instagram.com/opduhalde/' });
});
instagramRouter.use('/admin/instagram', requireAdmin);
instagramRouter.get('/admin/instagram', async (_req, res) => { res.set('Cache-Control', 'no-store').json(await settings()); });
instagramRouter.put('/admin/instagram', async (req, res) => {
  const origins = await auth.options.trustedOrigins;
  if (!req.get('origin') || !Array.isArray(origins) || !origins.includes(req.get('origin')!)) { res.status(403).json({ error: 'Origen no autorizado.' }); return; }
  const parsed = instagramSettings.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Usa hasta 12 enlaces únicos de publicaciones o reels públicos de Instagram.' }); return; }
  const result = await pool.query('UPDATE instagram_section SET enabled = $1, posts = $2::jsonb, updated_at = now() WHERE id = 1 RETURNING enabled, posts', [parsed.data.enabled, JSON.stringify(parsed.data.posts)]);
  res.json(result.rows[0]);
});
