import { useEffect, useRef, useState } from 'react';
import './instagram.css';
declare global { interface Window { instgrm?: { Embeds: { process: () => void } } } }
let embedLoader: Promise<void> | undefined;
function loadEmbeds() {
  if (window.instgrm) { window.instgrm.Embeds.process(); return Promise.resolve(); }
  if (!embedLoader) embedLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://www.instagram.com/embed.js'; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { script.remove(); embedLoader = undefined; reject(new Error('Instagram no disponible')); };
    document.body.appendChild(script);
  });
  return embedLoader.then(() => window.instgrm?.Embeds.process());
}
type Settings = { enabled: boolean; posts: string[] };
export function InstagramPost({ url, number }: { url: string; number: number }) {
  const container = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '300px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (visible) void loadEmbeds().catch(() => {}); }, [visible, url]);
  return <article ref={container} className="instagram-post" aria-label={`Publicación de Instagram ${number}`}><blockquote className="instagram-media" data-instgrm-permalink={url} data-instgrm-version="14"><a href={url} target="_blank" rel="noopener noreferrer">Ver publicación de @opduhalde en Instagram</a></blockquote><a href={url} target="_blank" rel="noopener noreferrer">Abrir publicación en Instagram ↗</a></article>;
}
export function Instagram() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/instagram', { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(setSettings).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!settings?.enabled) return null;
  return <section className="instagram-section" id="instagram" aria-labelledby="instagram-title"><div className="instagram-heading"><div><p>Conoce nuestro trabajo</p><h2 id="instagram-title">Síguenos en Instagram</h2></div><a href="https://www.instagram.com/opduhalde/" target="_blank" rel="noopener noreferrer">Seguir a @opduhalde ↗</a></div>{settings.posts.length > 0 && <div className="instagram-grid">{settings.posts.map((url, index) => <InstagramPost key={url} url={url} number={index + 1}/>)}</div>}</section>;
}
export function InstagramManager() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setError('');
    fetch('/api/admin/instagram', { signal: controller.signal, cache: 'no-store' }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; }).then(data => { setSettings(data); setSaved(JSON.stringify(data)); }).catch(error => { if (!controller.signal.aborted) setError(error.message || 'No se pudo cargar Instagram.'); });
    return () => controller.abort();
  }, [attempt]);
  function add() {
    setError(''); setMessage('');
    try {
      const url = new URL(link.trim()); const match = url.pathname.match(/^\/(?:[A-Za-z0-9_.]+\/)?(p|reel)\/([A-Za-z0-9_-]+)\/?$/);
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port || !match) throw new Error();
      const canonical = `https://www.instagram.com/${match[1]}/${match[2]}/`;
      if (!settings || settings.posts.includes(canonical) || settings.posts.length >= 12) { setError('No repitas enlaces. El máximo es 12 publicaciones.'); return; }
      setSettings({ ...settings, posts: [...settings.posts, canonical] }); setLink('');
    } catch { setError('Pega el enlace de una publicación o reel, no el enlace del perfil.'); }
  }
  function move(index: number, offset: number) {
    if (!settings) return;
    const posts = [...settings.posts]; [posts[index], posts[index + offset]] = [posts[index + offset], posts[index]];
    setSettings({ ...settings, posts }); setMessage('');
  }
  async function save() {
    if (!settings || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/instagram', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSettings(data); setSaved(JSON.stringify(data)); setMessage('Cambios publicados en el home.');
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.'); }
    finally { setBusy(false); }
  }
  if (!settings) return <div>{error ? <><p className="account-error" role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Reintentar</button></> : <p role="status">Cargando Instagram…</p>}</div>;
  return <section aria-label="Administrar Instagram"><h3>Instagram · @opduhalde</h3><p>Agrega enlaces de fotos o reels públicos con inserción permitida. El orden de esta lista es el orden del home. No requiere contraseñas ni sincroniza publicaciones automáticamente.</p><label className="instagram-enabled"><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={event => { setSettings({ ...settings, enabled: event.target.checked }); setMessage(''); }}/>Mostrar sección en el home</label><form className="instagram-add" onSubmit={event => { event.preventDefault(); add(); }}><label>Enlace de publicación o reel<input type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://www.instagram.com/reel/…/" required maxLength={500} disabled={busy}/></label><button disabled={busy || settings.posts.length >= 12}>Agregar a la lista</button></form><p>{settings.posts.length}/12 publicaciones. Los cambios se publican al guardar.</p><ol className="instagram-admin-list">{settings.posts.map((url, index) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a><div><button type="button" className="account-secondary" aria-label={`Subir publicación ${index + 1}`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="account-secondary" aria-label={`Bajar publicación ${index + 1}`} disabled={busy || index === settings.posts.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="account-danger" aria-label={`Quitar publicación ${index + 1}`} disabled={busy} onClick={() => { setSettings({ ...settings, posts: settings.posts.filter(post => post !== url) }); setMessage(''); }}>Quitar</button></div></li>)}</ol>{error && <p className="account-error" role="alert">{error}</p>}{message && <p className="account-success" role="status">{message}</p>}<button type="button" disabled={busy || JSON.stringify(settings) === saved} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar cambios de Instagram'}</button></section>;
}
