import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import { z } from 'zod';
import { pool } from './db.js';
import { auth } from './auth.js';
import { requireAdmin } from './profiles.js';
export const carouselsRouter = Router();
const MIN_CAROUSEL_IMAGES = 7;
const uuid = z.uuid();
const keySchema = z.enum(['exam', 'glasses', 'delivery', 'advice']);
const slideSelect = `SELECT s.id, s.carousel_key, s.position, s.alt, s.image_id, s.original_src IS NOT NULL AS can_restore,
  CASE WHEN s.image_id IS NULL THEN s.original_src ELSE '/api/carousel-images/' || s.image_id::text END AS src
  FROM carousel_slides s`;
async function listCarousels(_req: Request, res: Response) {
  const [groups, slides] = await Promise.all([
    pool.query('SELECT key, name, description FROM carousels ORDER BY display_order'),
    pool.query(slideSelect + ' ORDER BY s.position'),
  ]);
  res.set('Cache-Control', 'no-store').json({ rules: { minImages: MIN_CAROUSEL_IMAGES }, carousels: groups.rows.map(group => ({ ...group, slides: slides.rows.filter(slide => slide.carousel_key === group.key) })) });
}
carouselsRouter.get('/carousels', listCarousels);
carouselsRouter.get('/carousel-images/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) { res.sendStatus(404); return; }
  const result = await pool.query('SELECT data FROM carousel_images WHERE id = $1', [req.params.id]);
  if (!result.rowCount) { res.sendStatus(404); return; }
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).send(result.rows[0].data);
});
carouselsRouter.use('/admin/carousels', requireAdmin);
carouselsRouter.get('/admin/carousels', listCarousels);
carouselsRouter.get('/admin/carousels/:key/slides/:id/download', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success || !keySchema.safeParse(req.params.key).success) { res.status(400).json({ error: 'Foto inválida.' }); return; }
  const result = await pool.query('SELECT s.position, s.original_src, i.data FROM carousel_slides s LEFT JOIN carousel_images i ON i.id = s.image_id WHERE s.id = $1 AND s.carousel_key = $2', [req.params.id, req.params.key]);
  if (!result.rowCount) { res.status(404).json({ error: 'Foto no encontrada.' }); return; }
  const photo = result.rows[0];
  let data: Buffer = photo.data;
  if (!data) {
    const mediaRoot = fileURLToPath(new URL('../../frontend/public/assets/media/', import.meta.url));
    if (!photo.original_src?.startsWith('/assets/media/')) { res.status(404).json({ error: 'Imagen no encontrada.' }); return; }
    const path = resolve(mediaRoot, photo.original_src.slice('/assets/media/'.length));
    if (!path.startsWith(mediaRoot + (mediaRoot.endsWith(sep) ? '' : sep))) { res.sendStatus(404); return; }
    try { data = await readFile(path); }
    catch { res.status(404).json({ error: 'Imagen no encontrada.' }); return; }
  }
  const format = (await sharp(data).metadata()).format;
  const extension = format === 'jpeg' ? 'jpg' : format === 'png' ? 'png' : 'webp';
  res.set('Cache-Control', 'private, no-store').attachment(`${req.params.key}-foto-${photo.position + 1}.${extension}`).type(extension).send(data);
});
async function checkOrigin(req: Request, res: Response, next: NextFunction) {
  const origins = await auth.options.trustedOrigins;
  if (!req.get('origin') || !Array.isArray(origins) || !origins.includes(req.get('origin')!)) { res.status(403).json({ error: 'Origen no autorizado.' }); return; }
  next();
}
carouselsRouter.patch('/admin/carousels/:key/service', checkOrigin, async (req, res) => {
  const key = z.enum(['exam', 'glasses', 'delivery']).safeParse(req.params.key);
  const body = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().min(10).max(1500) }).strict().safeParse(req.body);
  if (!key.success || !body.success) { res.status(400).json({ error: 'Escribe un título de 2 a 100 caracteres y una descripción de 10 a 1500 caracteres.' }); return; }
  const result = await pool.query('UPDATE carousels SET name = $1, description = $2 WHERE key = $3 RETURNING key, name, description', [body.data.name, body.data.description, key.data]);
  if (!result.rowCount) { res.sendStatus(404); return; }
  res.json({ service: result.rows[0] });
});
carouselsRouter.patch('/admin/carousels/:key/slides/:id', checkOrigin, async (req, res) => {
  const body = z.object({ alt: z.string().trim().min(1).max(200) }).strict().safeParse(req.body);
  if (!keySchema.safeParse(req.params.key).success || !uuid.safeParse(req.params.id).success || !body.success) { res.status(400).json({ error: 'Escribe una descripción de 1 a 200 caracteres.' }); return; }
  const result = await pool.query(`UPDATE carousel_slides SET alt = $1, updated_at = now() WHERE id = $2 AND carousel_key = $3 RETURNING id, carousel_key, position, alt, image_id, original_src IS NOT NULL AS can_restore, CASE WHEN image_id IS NULL THEN original_src ELSE '/api/carousel-images/' || image_id::text END AS src`, [body.data.alt, req.params.id, req.params.key]);
  if (!result.rowCount) { res.status(404).json({ error: 'Foto no encontrada.' }); return; }
  res.json({ slide: result.rows[0] });
});
const uploadLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Espera un momento antes de subir más fotos.' } });
async function readPhoto(req: Request, res: Response): Promise<Buffer | null> {
  if (!Buffer.isBuffer(req.body) || !req.body.length) { res.status(415).json({ error: 'Usa una imagen JPG, PNG o WebP de hasta 8 MB.' }); return null; }
  try {
    const image = sharp(req.body, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '')) throw new Error('Formato no admitido');
    return await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { res.status(400).json({ error: 'La imagen no es válida. Usa un JPG, PNG o WebP de hasta 40 megapíxeles.' }); return null; }
}
const photoBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' });
carouselsRouter.post('/admin/carousels/:key/slides', checkOrigin, uploadLimit, photoBody, async (req, res) => {
  const key = keySchema.safeParse(req.params.key);
  const alt = z.string().trim().min(1).max(200).safeParse(req.query.alt);
  if (!key.success || !alt.success) { res.status(400).json({ error: 'Selecciona un carrusel y escribe una descripción de hasta 200 caracteres.' }); return; }
  const data = await readPhoto(req, res);
  if (!data) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize additions in this carousel so simultaneous uploads have distinct positions.
    const group = await client.query('SELECT key FROM carousels WHERE key = $1 FOR UPDATE', [key.data]);
    if (!group.rowCount) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Carrusel no encontrado.' }); return; }
    const next = await client.query('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM carousel_slides WHERE carousel_key = $1', [key.data]);
    const image = await client.query('INSERT INTO carousel_images (data) VALUES ($1) RETURNING id', [data]);
    const slide = await client.query('INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt, image_id) VALUES ($1, $2, NULL, $3, $3, $4) RETURNING id', [key.data, next.rows[0].position, alt.data, image.rows[0].id]);
    const result = await client.query(slideSelect + ' WHERE s.id = $1', [slide.rows[0].id]);
    await client.query('COMMIT'); res.status(201).json({ slide: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
carouselsRouter.put('/admin/carousels/:key/slides/:id/image', checkOrigin, uploadLimit, photoBody, async (req, res) => {
  const key = keySchema.safeParse(req.params.key);
  const id = uuid.safeParse(req.params.id);
  const alt = z.string().trim().min(1).max(200).safeParse(req.query.alt);
  if (!key.success || !id.success || !alt.success) { res.status(400).json({ error: 'Selecciona una foto e indica una descripción de hasta 200 caracteres.' }); return; }
  if (!Buffer.isBuffer(req.body) || !req.body.length) { res.status(415).json({ error: 'Usa una imagen JPG, PNG o WebP de hasta 8 MB.' }); return; }
  const existing = await pool.query('SELECT id FROM carousel_slides WHERE id = $1 AND carousel_key = $2', [id.data, key.data]);
  if (!existing.rowCount) { res.status(404).json({ error: 'Foto no encontrada.' }); return; }
  const data = await readPhoto(req, res);
  if (!data) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT image_id FROM carousel_slides WHERE id = $1 AND carousel_key = $2 FOR UPDATE', [id.data, key.data]);
    if (!locked.rowCount) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Foto no encontrada.' }); return; }
    const created = await client.query('INSERT INTO carousel_images (data) VALUES ($1) RETURNING id', [data]);
    await client.query('UPDATE carousel_slides SET image_id = $1, alt = $2, updated_at = now() WHERE id = $3', [created.rows[0].id, alt.data, id.data]);
    if (locked.rows[0].image_id) await client.query('DELETE FROM carousel_images WHERE id = $1', [locked.rows[0].image_id]);
    const result = await client.query(slideSelect + ' WHERE s.id = $1', [id.data]);
    await client.query('COMMIT');
    res.json({ slide: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
carouselsRouter.delete('/admin/carousels/:key/slides/:id/image', checkOrigin, async (req, res) => {
  if (!uuid.safeParse(req.params.id).success || !keySchema.safeParse(req.params.key).success) { res.status(400).json({ error: 'Foto inválida.' }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT image_id, original_src FROM carousel_slides WHERE id = $1 AND carousel_key = $2 FOR UPDATE', [req.params.id, req.params.key]);
    if (!current.rowCount) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Foto no encontrada.' }); return; }
    if (!current.rows[0].original_src) { await client.query('ROLLBACK'); res.status(409).json({ error: 'Esta foto fue agregada al carrusel y no tiene una original para restaurar.' }); return; }
    await client.query('UPDATE carousel_slides SET image_id = NULL, alt = original_alt, updated_at = now() WHERE id = $1', [req.params.id]);
    if (current.rows[0].image_id) await client.query('DELETE FROM carousel_images WHERE id = $1', [current.rows[0].image_id]);
    const result = await client.query(slideSelect + ' WHERE s.id = $1', [req.params.id]);
    await client.query('COMMIT'); res.json({ slide: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});

carouselsRouter.delete('/admin/carousels/:key/slides/:id', checkOrigin, async (req, res) => {
  if (!uuid.safeParse(req.params.id).success || !keySchema.safeParse(req.params.key).success) { res.status(400).json({ error: 'Foto inválida.' }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT key FROM carousels WHERE key = $1 FOR UPDATE', [req.params.key]);
    await client.query('SET CONSTRAINTS carousel_slides_carousel_key_position_key DEFERRED');
    const current = await client.query('SELECT image_id, original_src FROM carousel_slides WHERE id = $1 AND carousel_key = $2 FOR UPDATE', [req.params.id, req.params.key]);
    if (!current.rowCount) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Foto no encontrada.' }); return; }
    // The parent lock serializes additions/deletions before checking the minimum.
    const count = await client.query('SELECT count(*)::int AS total FROM carousel_slides WHERE carousel_key = $1', [req.params.key]);
    if (count.rows[0].total <= MIN_CAROUSEL_IMAGES) {
      await client.query('ROLLBACK');
      res.status(409).json({ code: 'CAROUSEL_MIN_IMAGES', minImages: MIN_CAROUSEL_IMAGES, error: `Cada carrusel debe conservar al menos ${MIN_CAROUSEL_IMAGES} imágenes. Agrega otra antes de eliminar esta.` });
      return;
    }
    await client.query('DELETE FROM carousel_slides WHERE id = $1', [req.params.id]);
    if (current.rows[0].image_id) await client.query('DELETE FROM carousel_images WHERE id = $1', [current.rows[0].image_id]);
    await client.query(`WITH numbered AS (SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS next_position FROM carousel_slides WHERE carousel_key = $1) UPDATE carousel_slides s SET position = numbered.next_position, updated_at = now() FROM numbered WHERE s.id = numbered.id`, [req.params.key]);
    await client.query('COMMIT'); res.sendStatus(204);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
