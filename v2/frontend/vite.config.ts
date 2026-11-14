import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], resolve: { dedupe: ["react", "react-dom"] }, server: { port: 5186, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3186' } } });
