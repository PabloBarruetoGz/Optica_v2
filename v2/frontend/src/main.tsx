import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CarouselProvider } from './lib/carousels';
const AccountPage = lazy(() => import('./components/AccountPage').then(module => ({ default: module.AccountPage })));
import './styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">Cargando…</p>}>{window.location.pathname.replace(/\/$/, '') === '/cuenta' ? <AccountPage /> : <CarouselProvider><App /></CarouselProvider>}</Suspense></StrictMode>);
