import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CarouselGroup, CarouselSlide, CarouselKey } from '../lib/carousels';
function SlideEditor({ slide, groupKey, number, canRemove, onSaved, onRemoved }: { slide?: CarouselSlide; groupKey: CarouselKey; number: number; canRemove?: boolean; onSaved: (slide: CarouselSlide) => void; onRemoved?: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [alt, setAlt] = useState(slide?.alt || '');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function chooseFile(next: File | undefined) {
    setMessage(''); setError('');
    if (!next) { setFile(null); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 8 * 1024 * 1024) {
      setError('Selecciona un JPG, PNG o WebP de hasta 8 MB.'); setFile(null);
      if (input.current) input.current.value = '';
      return;
    }
    setFile(next);
  }
  async function save(event?: FormEvent, restore = false) {
    event?.preventDefault();
    if (busy || (!restore && !file && (!slide || alt.trim() === slide.alt))) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const url = slide ? `/api/admin/carousels/${groupKey}/slides/${slide.id}/image` : `/api/admin/carousels/${groupKey}/slides`;
      const response = !restore && !file && slide ? await fetch(`/api/admin/carousels/${groupKey}/slides/${slide.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alt: alt.trim() }) }) : await fetch(restore ? url : `${url}?alt=${encodeURIComponent(alt.trim())}`, restore ? { method: 'DELETE' } : { method: slide ? 'PUT' : 'POST', headers: { 'Content-Type': file!.type }, body: file });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la foto.');
      onSaved(result.slide); setAlt(slide ? result.slide.alt : ''); setFile(null);
      if (input.current) input.current.value = '';
      setMessage(restore ? 'Se restauró la foto original.' : slide ? 'Foto publicada en el carrusel.' : 'Foto agregada al final del carrusel.');
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar la foto.'); }
    finally { setBusy(false); }
  }
  async function download() {
    if (busy || !slide) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/admin/carousels/${groupKey}/slides/${slide.id}/download`);
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo descargar la imagen.'); }
      const filename = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `foto-${number}.webp`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo descargar la imagen.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !slide || !canRemove) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/admin/carousels/${groupKey}/slides/${slide.id}`, { method: 'DELETE' });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo eliminar la imagen.'); }
      onRemoved?.(slide.id);
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo eliminar la imagen.'); }
    finally { setBusy(false); }
  }
  return <article className="carousel-editor-card">
    <>{preview || slide ? <img className="carousel-editor-preview" src={preview || slide!.src} alt={preview ? 'Vista previa de la nueva foto' : slide!.alt}/> : <div className="carousel-editor-placeholder"><span aria-hidden="true">＋</span>Selecciona una imagen</div>}</>
    <form onSubmit={event => void save(event)}>
      <h3>{slide ? `Foto ${number}` : 'Agregar foto'}</h3>
      <label>{slide ? `Reemplazar foto ${number}` : 'Nueva foto'}<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => chooseFile(e.target.files?.[0])}/></label>
      <label>{slide ? `Descripción de la foto ${number}` : 'Descripción de la nueva foto'}<input value={alt} onChange={e => setAlt(e.target.value)} required minLength={1} maxLength={200} disabled={busy}/></label>
      <p className="carousel-photo-help">Texto alternativo para describir esta foto. No modifica el título ni la descripción común del momento.</p>
      {file && <p className="carousel-editor-pending">Nueva foto seleccionada. Guarda para publicarla.</p>}
      <button type="submit" disabled={busy || !alt.trim() || (!file && (!slide || alt.trim() === slide.alt))}>{busy ? 'Guardando…' : slide ? 'Guardar foto' : 'Agregar foto'}</button>
      {slide?.can_restore && slide.image_id && <button className="account-secondary" type="button" disabled={busy} onClick={() => void save(undefined, true)}>Restaurar original</button>}
      {slide && <div className="carousel-image-actions"><button className="account-secondary" type="button" disabled={busy} onClick={() => void download()}>Descargar imagen</button><button className="account-danger" type="button" disabled={busy || !canRemove} onClick={() => setConfirmDelete(true)}>Eliminar imagen</button></div>}
      {slide && confirmDelete && <div role="group" aria-label={`Confirmar eliminación de foto ${number}`}><p>¿Eliminar la foto {number}? Se quitará del sitio y las demás se numerarán nuevamente. Esta acción no se puede deshacer.</p><button className="account-danger" type="button" disabled={busy || !canRemove} onClick={() => void remove()}>Confirmar eliminación</button><button className="account-secondary" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button></div>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {message && <p className="account-success" role="status">{message}</p>}
    </form>
  </article>;
}
function ServiceEditor({ group, onSaved }: { group: CarouselGroup; onSaved: (service: Pick<CarouselGroup, 'key' | 'name' | 'description'>) => void }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/admin/carousels/${group.key}/service`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), description: description.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el servicio.');
      onSaved(result.service); setName(result.service.name); setDescription(result.service.description); setMessage('Título y descripción publicados junto al carrusel de este servicio.');
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar el servicio.'); }
    finally { setBusy(false); }
  }
  return <details className="carousel-service-editor" aria-label="Texto del servicio corporativo"><summary><strong>Editar título y descripción del momento</strong><span>{group.name} · {group.description}</span></summary><p>Texto común a las {group.slides.length} fotos de este momento.</p><form onSubmit={save}><label>Título del momento<input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={100} disabled={busy}/></label><label>Descripción común del momento<textarea value={description} onChange={event => setDescription(event.target.value)} required minLength={10} maxLength={1500} rows={4} disabled={busy}/></label><button type="submit" disabled={busy || name.trim().length < 2 || description.trim().length < 10 || (name.trim() === group.name && description.trim() === group.description)}>{busy ? 'Guardando…' : 'Guardar texto del momento'}</button>{error && <p className="account-error" role="alert">{error}</p>}{message && <p className="account-success" role="status">{message}</p>}</form></details>;
}
export function CarouselManager() {
  const [groups, setGroups] = useState<CarouselGroup[]>([]);
  const [minImages, setMinImages] = useState<number | null>(null);
  const [collection, setCollection] = useState<'corporate' | 'advice'>('corporate');
  const [selected, setSelected] = useState<CarouselKey>('exam');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    fetch('/api/admin/carousels', { signal: controller.signal, cache: 'no-store' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los carruseles.'); return data; })
      .then(data => { setGroups(data.carousels); setMinImages(data.rules.minImages); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  function saved(groupKey: CarouselKey, slide: CarouselSlide) {
    setGroups(previous => previous.map(group => group.key === groupKey ? { ...group, slides: (group.slides.some(current => current.id === slide.id) ? group.slides.map(current => current.id === slide.id ? slide : current) : [...group.slides, slide]).sort((a, b) => a.position - b.position) } : group));
  }
  function removed(groupKey: CarouselKey, id: string) {
    setGroups(previous => previous.map(group => group.key === groupKey ? { ...group, slides: group.slides.filter(slide => slide.id !== id).map((slide, position) => ({ ...slide, position })) } : group));
  }
  if (loading) return <p role="status">Cargando fotos…</p>;
  if (error) return <div role="alert"><p className="account-error">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Reintentar</button></div>;
  const moments = groups.filter(group => group.key !== 'advice');
  const group = groups.find(group => group.key === (collection === 'advice' ? 'advice' : selected));
  return <div className="carousel-manager"><h3>Carruseles del sitio</h3>
    <div className="carousel-collection-items" role="group" aria-label="Carruseles del sitio">
      <button type="button" id="carousel-collection-corporate" aria-pressed={collection === 'corporate'} onClick={() => setCollection('corporate')}><strong>Servicio corporativo</strong><span>3 momentos · {moments.reduce((total, moment) => total + moment.slides.length, 0)} fotos</span></button>
      <button type="button" id="carousel-collection-advice" aria-pressed={collection === 'advice'} onClick={() => setCollection('advice')}><strong>Asesoría de imagen</strong><span>{groups.find(item => item.key === 'advice')?.slides.length ?? 0} fotos</span></button>
    </div>
    {collection === 'corporate' && <><div className="carousel-group-tabs" role="tablist" aria-label="Momentos del servicio corporativo">
      {moments.map((item, index) => <button type="button" role="tab" key={item.key} id={`carousel-tab-${item.key}`} aria-controls={`carousel-panel-${item.key}`} aria-selected={selected === item.key} tabIndex={selected === item.key ? 0 : -1} onClick={() => setSelected(item.key)} onKeyDown={event => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % moments.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + moments.length) % moments.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = moments.length - 1;
        else return;
        event.preventDefault(); setSelected(moments[next].key);
        document.getElementById(`carousel-tab-${moments[next].key}`)?.focus();
      }}>{item.name} <span>({item.slides.length})</span></button>)}
    </div></>}
    {group && <div role={collection === 'corporate' ? 'tabpanel' : 'region'} id={`carousel-panel-${group.key}`} aria-labelledby={collection === 'corporate' ? `carousel-tab-${group.key}` : 'carousel-collection-advice'} tabIndex={0}>
      {group.key !== 'advice' && <ServiceEditor key={group.key} group={group} onSaved={service => setGroups(previous => previous.map(current => current.key === service.key ? { ...current, ...service } : current))}/>}
      <div className="carousel-photos-heading"><h3>{group.slides.length} fotos · {group.name}</h3><p role="status">Mínimo {minImages} fotos por {group.key === 'advice' ? 'galería' : 'momento'}.{minImages !== null && group.slides.length <= minImages ? ' Agrega una antes de eliminar otra.' : ' Numeración automática al eliminar.'}</p></div>
      <div className="carousel-editor-grid">
        <SlideEditor key={`new-${group.key}`} groupKey={group.key} number={group.slides.length + 1} onSaved={slide => saved(group.key, slide)}/>
        {group.slides.map((slide, index) => <SlideEditor key={slide.id} slide={slide} groupKey={group.key} number={index + 1} canRemove={minImages !== null && group.slides.length > minImages} onSaved={updated => saved(group.key, updated)} onRemoved={id => removed(group.key, id)}/>)}
      </div>
    </div>}
  </div>;
}
