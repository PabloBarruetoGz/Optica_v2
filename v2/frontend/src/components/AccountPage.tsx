import { OrdersManager, MyOrders } from './Orders';
import { AdvisoryBooking, AgendaManager } from './Advisory';
import { InstagramManager } from './Instagram';
import { CarouselManager } from './CarouselManager';
import { useEffect, useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth-client';
import './account.css';

type User = { id: string; name: string; email: string; role: 'admin' | 'client' };
type Inquiry = { id: string; name: string; email: string; phone: string; service: string; kind: string; company: string | null; message: string; created_at: string };
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}
function AdminPanel({ currentId }: { currentId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [tab, setTab] = useState<'users' | 'inquiries' | 'carousels' | 'instagram' | 'orders' | 'agenda'>('users');
  useEffect(() => {
    let active = true;
    Promise.all([api<{ users: User[] }>('/admin/users'), api<{ inquiries: Inquiry[] }>('/admin/inquiries')])
      .then(([u, i]) => { if (active) { setUsers(u.users); setInquiries(i.inquiries); } })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function changeRole(user: User, role: string) {
    if (updating || user.role === role) return;
    setUpdating(user.id); setError('');
    try {
      const result = await api<{ user: User }>(`/admin/users/${encodeURIComponent(user.id)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setUsers(previous => previous.map(u => u.id === user.id ? result.user : u));
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo cambiar el perfil.'); }
    finally { setUpdating(null); }
  }
  return <section className="account-admin" aria-label="Administración">
    <div className="account-admin-toolbar"><div><h2>Administración</h2><p>Usuarios, solicitudes y contenido del sitio.</p></div>
    <div className="account-tabs"><button type="button" aria-pressed={tab === 'users'} onClick={() => setTab('users')}>Usuarios</button><button type="button" aria-pressed={tab === 'inquiries'} onClick={() => setTab('inquiries')}>Solicitudes</button><button type="button" aria-pressed={tab === 'carousels'} onClick={() => setTab('carousels')}>Carruseles</button><button type="button" aria-pressed={tab === 'instagram'} onClick={() => setTab('instagram')}>Instagram</button><button type="button" aria-pressed={tab === 'orders'} onClick={() => setTab('orders')}>Órdenes de compra</button><button type="button" aria-pressed={tab === 'agenda'} onClick={() => setTab('agenda')}>Agenda</button></div></div>
    {error && <p role="alert" className="account-error">{error}</p>}
    {tab === 'orders' ? <OrdersManager /> : tab === 'agenda' ? <AgendaManager /> : tab === 'instagram' ? <InstagramManager /> : tab === 'carousels' ? <CarouselManager /> : loading ? <p role="status">Cargando administración…</p> : tab === 'users' ? <>
      <p>Se muestran los 100 usuarios más recientes.</p>
      <div className="account-table"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Perfil</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.name}{user.id === currentId ? ' (tú)' : ''}</td><td>{user.email}</td><td><select aria-label={`Perfil de ${user.name}`} value={user.role} disabled={user.id === currentId || updating !== null} onChange={e => void changeRole(user, e.target.value)}><option value="admin">Administrador</option><option value="client">Cliente</option></select></td></tr>)}</tbody></table></div>
    </> : <><p>Se muestran las 100 solicitudes más recientes.</p>{inquiries.length === 0 ? <p>Aún no hay solicitudes.</p> : inquiries.map(item => <details className="account-inquiry" key={item.id}><summary>{item.name} · {item.service} · {new Date(item.created_at).toLocaleDateString('es-CL')}</summary><p>{item.kind}{item.company ? ` · ${item.company}` : ''}</p><p><a href={`mailto:${item.email}`}>{item.email}</a> · <a href={`tel:${item.phone}`}>{item.phone}</a></p><p>{item.message || 'Sin comentario.'}</p></details>)}</>}
  </section>;
}
export function AccountPage() {
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
  const [view, setView] = useState<'profile' | 'admin'>(() => window.location.hash === '#mis-datos' ? 'profile' : 'admin');
  useEffect(() => {
    const syncView = () => setView(window.location.hash === '#mis-datos' ? 'profile' : 'admin');
    window.addEventListener('hashchange', syncView);
    return () => window.removeEventListener('hashchange', syncView);
  }, []);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [googleError, setGoogleError] = useState(() => new URLSearchParams(window.location.search).get('error') === 'google');
  useEffect(() => {
    if (isPending) return;
    // Consume the callback marker without reloading or dropping other query/hash state.
    const url = new URL(window.location.href);
    if (url.searchParams.get('error') === 'google') {
      url.searchParams.delete('error');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    if (session?.user.id) setGoogleError(false);
  }, [isPending, session?.user.id]);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth-options', { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(options => setGoogleAvailable(options.google === true)).catch(() => { if (!controller.signal.aborted) setGoogleAvailable(false); });
    return () => controller.abort();
  }, []);
  async function signInGoogle() {
    if (busy || !googleAvailable) return;
    setBusy(true); setError(''); setGoogleError(false); setStatus('');
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/cuenta', errorCallbackURL: '/cuenta?error=google' });
      if (result.error) { setError('No pudimos iniciar el acceso con Google. Intenta nuevamente.'); setBusy(false); }
    } catch { setError('No pudimos conectar con Google. Intenta nuevamente.'); setBusy(false); }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email')).trim();
    const password = String(values.get('password'));
    setBusy(true); setError(''); setGoogleError(false); setStatus('');
    try {
      const result = register ? await authClient.signUp.email({ email, password, name: String(values.get('name')).trim() }) : await authClient.signIn.email({ email, password });
      if (result.error) { setError(register ? 'No pudimos crear la cuenta. Revisa los datos o inicia sesión si ya estás registrado.' : 'No pudimos iniciar sesión. Revisa el correo y la contraseña.'); return; }
      await refetch();
    } catch { setError('No pudimos conectar. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }
  async function updateName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    setBusy(true); setError(''); setGoogleError(false); setStatus('');
    try {
      const result = await authClient.updateUser({ name });
      if (result.error) throw new Error('No pudimos actualizar tus datos.');
      await refetch(); setStatus('Tus datos se actualizaron.');
    } catch { setError('No pudimos actualizar tus datos. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError(''); setGoogleError(false); setStatus('');
    try { const result = await authClient.signOut(); if (result.error) throw new Error(); setRegister(false); await refetch(); }
    catch { setError('No pudimos cerrar la sesión. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }
  const admin = session?.user.role === 'admin';
  return <div className="account-page"><header className="account-header"><a href="/" aria-label="Volver a Óptica Duhalde"><img src="/assets/media/LOGO-ORIGINAL--1536x1536-5f8250b264.jpg" alt="Óptica Duhalde"/></a><a href="/">← Volver al sitio</a></header><main className="account-shell">
    {isPending ? <p role="status">Cargando tu cuenta…</p> : sessionError ? <div role="alert"><p>No pudimos cargar tu sesión.</p><button onClick={() => void refetch()}>Reintentar</button></div> : session ? <>
      <div className="account-title"><div><span className="account-eyebrow">{admin ? 'Administrador' : 'Cliente'}</span><h1>Hola, {session.user.name}</h1><p>{admin ? 'Administra los usuarios y las solicitudes de Óptica Duhalde.' : 'Bienvenido a tu cuenta de Óptica Duhalde.'}</p></div><button type="button" className="account-secondary" disabled={busy} onClick={() => void signOut()}>Cerrar sesión</button></div>
      {admin && <nav className="account-view-nav" aria-label="Secciones de la cuenta"><a href="#administracion" aria-current={view === 'admin' ? 'page' : undefined}>Administración<span>Usuarios, solicitudes y carruseles</span></a><a href="#mis-datos" aria-current={view === 'profile' ? 'page' : undefined}>Mis datos<span>Información de tu cuenta</span></a></nav>}
      {(!admin || view === 'profile') && <section className="account-card account-profile" id="mis-datos"><h2>Mis datos</h2><p>Actualiza tu nombre y consulta la información de tu cuenta.</p><form onSubmit={updateName}><label>Nombre completo<input key={session.user.name} name="name" defaultValue={session.user.name} autoComplete="name" required minLength={2} maxLength={150}/></label><label>Correo electrónico<input value={session.user.email} readOnly aria-readonly="true"/></label><p>Perfil: <strong>{admin ? 'Administrador' : 'Cliente'}</strong></p><button disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar mis datos'}</button></form></section>}
      {!admin && <><nav className="account-view-nav" aria-label="Accesos del cliente"><a href="#agenda-asesoria">Reservar asesoría<span>Ver días y horas disponibles</span></a><a href="#mis-lentes">Mis lentes<span>Consultar mis pedidos</span></a></nav><AdvisoryBooking customer={{name:session.user.name,email:session.user.email}}/><div id="mis-lentes"><MyOrders /></div></>}
      {admin && view === 'admin' && <div id="administracion"><AdminPanel currentId={session.user.id}/></div>}
    </> : <section className="account-card account-login"><span className="account-eyebrow">Mi cuenta</span><h1>{register ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h1><p>{register ? 'Regístrate como cliente de Óptica Duhalde.' : 'Ingresa con Google o con tu correo y contraseña.'}</p><button className="account-google" type="button" disabled={busy || !googleAvailable} onClick={() => void signInGoogle()}><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92A6 6 0 0 1 6.09 12c0-.67.11-1.32.31-1.92V7.49H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.51l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z"/></svg>Continuar con Google</button>{googleAvailable === false && <p className="account-google-unavailable">Google no está disponible en este momento. Puedes ingresar con tu correo.</p>}<div className="account-divider">o continúa con tu correo</div><form onSubmit={authenticate} key={register ? 'register' : 'login'}>{register && <label>Nombre completo<input name="name" autoComplete="name" required minLength={2} maxLength={150}/></label>}<label>Correo electrónico<input type="email" name="email" autoComplete="email" required maxLength={254}/></label><label>Contraseña<input type="password" name="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength={128} aria-describedby={register ? 'password-help' : undefined}/></label>{register && <p id="password-help">Usa al menos 12 caracteres.</p>}<button type="submit" disabled={busy}>{busy ? 'Espera un momento…' : register ? 'Crear cuenta de cliente' : 'Iniciar sesión'}</button></form><button type="button" className="account-link" disabled={busy} onClick={() => { setRegister(!register); setError(''); setStatus(''); }}>{register ? 'Ya tengo una cuenta' : 'Crear una cuenta'}</button></section>}
    {!isPending && !session && !sessionError && googleError && <p role="alert" className="account-error">No se completó el acceso con Google. Intenta nuevamente.</p>}
    {error && <p role="alert" className="account-error">{error}</p>}{status && <p role="status" className="account-success">{status}</p>}
  </main><footer className="account-footer">Copyright © 2026 Todos los derechos reservados GatoDev.</footer></div>;
}
