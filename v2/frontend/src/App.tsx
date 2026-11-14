import { AdvisoryBooking } from './components/Advisory';
import { Instagram } from './components/Instagram';
import { Location } from './components/Location';
import { useState } from 'react';
import { Section01 } from './components/Section01';
import { Section02 } from './components/Section02';
import { Section03 } from './components/Section03';
import { Section04 } from './components/Section04';
import { Section05 } from './components/Section05';
import { Section06 } from './components/Section06';
import { Section07 } from './components/Section07';
import { Section09 } from './components/Section09';
import { Section10 } from './components/Section10';
import { Section11 } from './components/Section11';
export default function App() { const [open, setOpen] = useState(false); return <div className={open ? 'v2-menu-open' : ''}><main className="site-main" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setOpen(false); }}><article className="post-9 page type-page status-publish ast-article-single" id="post-9"><div className="entry-content clear"><div className="elementor elementor-9"><Section01 open={open} onToggle={() => setOpen(!open)} /><Section02 /><Section03 /><Section04 /><Section05 /><Section06 /><Section07 /><section className="commerce-brand-process" aria-labelledby="process-title"><h2 id="process-title">Así te asesoramos</h2><ol><li>Conocemos tus preferencias y tu estilo personal.</li><li>Analizamos las características de tu rostro.</li><li>Te orientamos sobre colores, formas y monturas.</li><li>Elegimos contigo lentes que equilibren estilo, comodidad y funcionalidad.</li></ol></section><AdvisoryBooking /><Instagram /><Section09 /><Section10 /><Location /><Section11 /></div></div></article></main><a className="v2-whatsapp" href="https://wa.me/56999420534" target="_blank" rel="noopener noreferrer" aria-label="Contactar por WhatsApp"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3A13 13 0 0 0 4.8 22.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.7a10.7 10.7 0 0 1-5.5-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7Zm5.9-8c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-.9 1.2-.3.2-.7 0a8.8 8.8 0 0 1-4.3-3.8c-.3-.5.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.3 0-.6.1-.8.4-2.7 3 .3 6.5 2.6 8.5 2.4 2 5.2 3.1 6.6 2.7 1-.3 2-1 2.2-2 .1-.4.1-.9 0-1-.1-.1-.3-.2-.6-.3Z" /></svg></a></div>; }