import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import sharp from 'sharp';
import { app } from './app.js';
import { pool } from './db.js';

test('Administrador puede agregar, reemplazar y restaurar fotos; Clientes no pueden modificarlas', async () => {
  // Isolate destructive boundary tests from the site's real photos and accounts.
  const schema = `carousel_test_${randomUUID().replaceAll('-', '')}`;
  const searchPath = `SET search_path TO "${schema}"`;
  const setup = await pool.connect();
  await setup.query(`CREATE SCHEMA "${schema}"`);
  const tables = await setup.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  for (const { tablename } of tables.rows) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    await setup.query(`CREATE TABLE "${schema}".${quoted} (LIKE public.${quoted} INCLUDING ALL)`);
  }
  for (const table of ['carousels', 'carousel_images', 'carousel_slides']) {
    await setup.query(`INSERT INTO "${schema}".${table} SELECT * FROM public.${table}`);
  }
  await setup.query(searchPath); setup.release();
  pool.options.options = `-c search_path=${schema}`;
  const connections = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
  await Promise.all(connections.map(connection => connection.query(searchPath)));
  connections.forEach(connection => connection.release());
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const origin = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:5186';
  const ids: string[] = [];
  let slideId: string | undefined;
  const createdImages: string[] = [];
  const createdSlides: string[] = [];
  const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#973758' } }).png().toBuffer();
  async function createUser(role: 'admin' | 'client') {
    const response = await fetch(`${base}/auth/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ name: 'Prueba carruseles', email: `qa-carousel-${randomUUID()}@example.com`, password: randomBytes(24).toString('base64url') }) });
    assert.equal(response.status, 200);
    const user = (await response.json()).user; ids.push(user.id);
    if (role === 'admin') await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [role, user.id]);
    return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  }
  function upload(cookie?: string, data: Buffer = image, contentType = 'image/png', requestOrigin = origin) {
    return fetch(`${base}/admin/carousels/exam/slides/${slideId}/image?alt=Foto%20de%20prueba`, { method: 'PUT', headers: { Origin: requestOrigin, 'Content-Type': contentType, ...(cookie ? { Cookie: cookie } : {}) }, body: new Uint8Array(data) });
  }
  try {
    const fixture = await pool.query(`INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 99999, '/assets/media/DSC07111-f923eceeb3.webp', 'Original de prueba', 'Original de prueba') RETURNING id`);
    slideId = fixture.rows[0].id;
    assert.equal((await upload()).status, 401);
    const client = await createUser('client');
    assert.equal((await upload(client)).status, 403);
    assert.equal((await fetch(`${base}/admin/carousels`, { headers: { Cookie: client } })).status, 403);
    const admin = await createUser('admin');
    await pool.query('INSERT INTO instagram_section (id) VALUES (1)');
    const igPath = `${base}/admin/instagram`;
    const igData = { enabled: true, posts: ['https://www.instagram.com/opduhalde/reel/DUoL9SsANfa/?igsh=test'] };
    const putInstagram = (cookie: string, data: unknown, requestOrigin = origin) => fetch(igPath, { method: 'PUT', headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal((await fetch(igPath)).status, 401);
    assert.equal((await putInstagram(client, igData)).status, 403);
    assert.equal((await putInstagram(admin, igData, 'https://no-autorizado.example')).status, 403);
    assert.equal((await putInstagram(admin, { enabled: true, posts: ['https://evil.example/reel/test/'] })).status, 400);
    assert.equal((await putInstagram(admin, { enabled: true, posts: ['https://www.instagram.com/opduhalde/'] })).status, 400);
    assert.equal((await putInstagram(admin, igData)).status, 200);
    const igPublic = await (await fetch(`${base}/instagram`)).json();
    assert.deepEqual(igPublic.posts, ['https://www.instagram.com/reel/DUoL9SsANfa/']);
    assert.equal((await putInstagram(admin, { enabled: true, posts: [...igData.posts, igPublic.posts[0]] })).status, 400, 'rechaza duplicados después de normalizar');
    assert.equal((await putInstagram(admin, { enabled: false, posts: igPublic.posts })).status, 200);
    assert.deepEqual((await (await fetch(`${base}/instagram`)).json()).posts, []);
    assert.deepEqual((await (await fetch(igPath, { headers: { Cookie: admin } })).json()).posts, igPublic.posts, 'ocultar no borra las publicaciones');

    // A photo belongs to exactly one moment; a route for another moment cannot mutate it.
    const beforeOtherMoment = (await pool.query("SELECT id, position, alt FROM carousel_slides WHERE carousel_key = 'glasses' ORDER BY position")).rows;
    for (const [suffix, body] of [['', { alt: 'No debe cambiar de momento' }], ['/image', null]] as const) {
      const wrongMoment = await fetch(`${base}/admin/carousels/glasses/slides/${slideId}${suffix}`, { method: body ? 'PATCH' : 'DELETE', headers: { Origin: origin, Cookie: admin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      assert.equal(wrongMoment.status, 404);
    }
    assert.equal((await fetch(`${base}/admin/carousels/glasses/slides/${slideId}`, { method: 'DELETE', headers: { Origin: origin, Cookie: admin } })).status, 404);
    assert.deepEqual((await pool.query("SELECT id, position, alt FROM carousel_slides WHERE carousel_key = 'glasses' ORDER BY position")).rows, beforeOtherMoment, 'otra galería conserva sus fotos, textos y posiciones');

    function editService(cookie: string, data: unknown, requestOrigin = origin) {
      return fetch(`${base}/admin/carousels/exam/service`, { method: 'PATCH', headers: { Origin: requestOrigin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    }
    const serviceText = { name: 'Examen visual corporativo', description: 'Descripción editable vinculada a las fotos del examen visual.' };
    assert.equal((await editService(client, serviceText)).status, 403);
    assert.equal((await editService(admin, serviceText, 'https://no-autorizado.example')).status, 403);
    assert.equal((await editService(admin, { name: 'A', description: '' })).status, 400);
    assert.equal((await editService(admin, serviceText)).status, 200);
    const service = (await (await fetch(`${base}/carousels`)).json()).carousels.find((group: { key: string }) => group.key === 'exam');
    assert.equal(service.name, serviceText.name); assert.equal(service.description, serviceText.description);
    assert.ok(service.slides.some((photo: { id: string }) => photo.id === slideId), 'el texto permanece vinculado al mismo grupo de fotos');
    function editPhotoText(cookie: string, alt: string) {
      return fetch(`${base}/admin/carousels/exam/slides/${slideId}`, { method: 'PATCH', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ alt }) });
    }
    assert.equal((await editPhotoText(client, 'Descripción accesible')).status, 403);
    assert.equal((await editPhotoText(admin, '')).status, 400);
    const photoText = await editPhotoText(admin, 'Descripción accesible del examen');
    assert.equal(photoText.status, 200);
    const described = (await photoText.json()).slide;
    assert.equal(described.alt, 'Descripción accesible del examen');
    assert.equal(described.image_id, null, 'editar el texto no requiere subir ni sustituir la imagen');
    assert.equal(described.src, '/assets/media/DSC07111-f923eceeb3.webp');

    assert.equal((await fetch(`${base}/admin/carousels/exam/slides/${slideId}/download`, { headers: { Cookie: client } })).status, 403);
    const originalDownload = await fetch(`${base}/admin/carousels/exam/slides/${slideId}/download`, { headers: { Cookie: admin } });
    assert.equal(originalDownload.status, 200);
    assert.ok(originalDownload.headers.get('content-disposition')?.includes('attachment'));
    assert.equal((await sharp(Buffer.from(await originalDownload.arrayBuffer())).metadata()).format, 'webp');

    assert.equal((await upload(admin, image, 'image/png', 'https://no-autorizado.example')).status, 403);
    assert.equal((await upload(admin, Buffer.from('<svg/>'), 'image/svg+xml')).status, 415);
    assert.equal((await upload(admin, Buffer.from('not-an-image'))).status, 400);
    assert.equal((await upload(admin, Buffer.alloc(8 * 1024 * 1024 + 1))).status, 413);
    const response = await upload(admin); assert.equal(response.status, 200);
    const saved = (await response.json()).slide; createdImages.push(saved.image_id);
    assert.equal(saved.alt, 'Foto de prueba');
    assert.ok(saved.src.startsWith('/api/carousel-images/'));
    const savedDownload = await fetch(`${base}/admin/carousels/exam/slides/${slideId}/download`, { headers: { Cookie: admin } });
    assert.equal(savedDownload.status, 200);
    assert.equal(savedDownload.headers.get('content-type'), 'image/webp');

    const media = await fetch(base.replace(/\/api$/, '') + saved.src); assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'image/webp');
    const metadata = await sharp(Buffer.from(await media.arrayBuffer())).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 20);
    const publicListing = await (await fetch(`${base}/carousels`)).json();
    assert.equal(publicListing.carousels.find((g: { key: string }) => g.key === 'exam').slides.find((s: { id: string }) => s.id === slideId).src, saved.src);
    assert.equal((await pool.query('SELECT image_id FROM carousel_slides WHERE id = $1', [slideId])).rows[0].image_id, saved.image_id);
    const restore = await fetch(`${base}/admin/carousels/exam/slides/${slideId}/image`, { method: 'DELETE', headers: { Origin: origin, Cookie: admin } });
    assert.equal(restore.status, 200);
    const restored = (await restore.json()).slide;
    assert.equal(restored.image_id, null); assert.equal(restored.src, '/assets/media/DSC07111-f923eceeb3.webp');
    assert.equal((await pool.query('SELECT 1 FROM carousel_images WHERE id = $1', [saved.image_id])).rowCount, 0);
    function add(cookie?: string) {
      return fetch(`${base}/admin/carousels/exam/slides?alt=Nueva%20foto`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'image/png', ...(cookie ? { Cookie: cookie } : {}) }, body: new Uint8Array(image) });
    }
    assert.equal((await add()).status, 401);
    assert.equal((await add(client)).status, 403);
    const additions = await Promise.all([add(admin), add(admin)]);
    const added = [];
    for (const result of additions) {
      assert.equal(result.status, 201);
      const slide = (await result.json()).slide;
      createdSlides.push(slide.id); createdImages.push(slide.image_id); added.push(slide);
      assert.equal(slide.can_restore, false);
      assert.equal(slide.alt, 'Nueva foto');
    }
    assert.notEqual(added[0].position, added[1].position, 'subidas simultáneas no comparten posición');
    assert.ok(added.every(slide => slide.position > 99999));
    const listingAfterAdd = await (await fetch(`${base}/carousels`)).json();
    const ordered = listingAfterAdd.carousels.find((g: { key: string }) => g.key === 'exam').slides;
    assert.deepEqual(new Set(ordered.slice(-2).map((slide: { id: string }) => slide.id)), new Set(createdSlides));
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM carousel_slides WHERE id = ANY($1::uuid[])', [createdSlides])).rows[0].total, 2);
    assert.equal((await fetch(`${base}/admin/carousels/exam/slides/${added[0].id}/image`, { method: 'DELETE', headers: { Origin: origin, Cookie: admin } })).status, 409, 'una foto nueva no se restaura a una ruta inexistente');
    assert.equal((await fetch(`${base}/admin/carousels/exam/slides/${slideId}`, { method: 'DELETE', headers: { Origin: origin, Cookie: admin } })).status, 204, 'el administrador también puede eliminar fotos originales');
    assert.equal((await fetch(`${base}/admin/carousels/exam/slides/${added[0].id}`, { method: 'DELETE', headers: { Origin: origin, Cookie: client } })).status, 403);
    assert.equal((await fetch(`${base}/admin/carousels/exam/slides/${added[0].id}`, { method: 'DELETE', headers: { Origin: origin, Cookie: admin } })).status, 204);
    assert.equal((await fetch(base.replace(/\/api$/, '') + added[0].src)).status, 404);
    const renumbered = (await (await fetch(`${base}/carousels`)).json()).carousels.find((g: { key: string }) => g.key === 'exam').slides;
    assert.deepEqual(renumbered.map((slide: { position: number }) => slide.position), renumbered.map((_: unknown, index: number) => index), 'la numeración queda consecutiva después de eliminar');
    assert.ok(renumbered.some((slide: { id: string }) => slide.id === added[1].id), 'la foto posterior se conserva');
    assert.equal(publicListing.rules.minImages, 7);
    const remove = (id: string) => fetch(`${base}/admin/carousels/exam/slides/${id}`, { method: 'DELETE', headers: { Origin: origin, Cookie: admin } });
    // Leave eight in the isolated copy, then race two deletions at the boundary.
    const remaining = (await pool.query("SELECT id FROM carousel_slides WHERE carousel_key = 'exam' ORDER BY position")).rows;
    for (const photo of remaining.slice(8)) assert.equal((await remove(photo.id)).status, 204);
    const raced = await Promise.all([remove(remaining[0].id), remove(remaining[1].id)]);
    assert.deepEqual(raced.map(response => response.status).sort(), [204, 409], 'solo una eliminación simultánea puede dejar el carrusel en siete');
    const rejected = raced.find(response => response.status === 409)!;
    assert.equal((await rejected.json()).code, 'CAROUSEL_MIN_IMAGES');
    const finalSlides = (await (await fetch(`${base}/carousels`)).json()).carousels.find((group: { key: string }) => group.key === 'exam').slides;
    assert.equal(finalSlides.length, 7);
    assert.deepEqual(finalSlides.map((slide: { position: number }) => slide.position), [0, 1, 2, 3, 4, 5, 6]);
    const protectedPhoto = finalSlides[0];
    assert.equal((await remove(protectedPhoto.id)).status, 409);
    assert.equal((await fetch(`${base}/admin/carousels/exam/slides/${protectedPhoto.id}/download`, { headers: { Cookie: admin } })).status, 200, 'el mínimo no impide descargar');
    const additionAtMinimum = await add(admin);
    assert.equal(additionAtMinimum.status, 201, 'se puede agregar para volver a permitir eliminar');
    const extra = (await additionAtMinimum.json()).slide;
    createdSlides.push(extra.id); createdImages.push(extra.image_id);
    assert.equal((await remove(extra.id)).status, 204);



  } finally {
    await pool.query('DELETE FROM carousel_slides WHERE id = ANY($1::uuid[])', [createdSlides]);
    if (slideId) await pool.query('DELETE FROM carousel_slides WHERE id = $1', [slideId]);
    await pool.query('DELETE FROM carousel_images WHERE id = ANY($1::uuid[])', [createdImages]);
    await pool.query('DELETE FROM session WHERE "userId" = ANY($1::text[])', [ids]);
    await pool.query('DELETE FROM account WHERE "userId" = ANY($1::text[])', [ids]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [ids]);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
