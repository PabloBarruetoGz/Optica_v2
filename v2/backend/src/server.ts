import { processPickup } from './whatsapp.js';
import { app } from './app.js';
import { pool } from './db.js';
const port = Number(process.env.PORT || 3186);
await pool.query('SELECT 1');
const server = app.listen(port, '127.0.0.1', () => console.log(`API: http://127.0.0.1:${port}`));
let running: Promise<void> | undefined;
const worker = setInterval(() => {
  if (!running) running=processPickup().catch(()=>console.error('Error procesando avisos de retiro.')).finally(()=>{running=undefined;});
}, 5000);
worker.unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { clearInterval(worker); server.close(() => { void Promise.resolve(running).then(() => pool.end()).then(() => process.exit(0)); }); });
