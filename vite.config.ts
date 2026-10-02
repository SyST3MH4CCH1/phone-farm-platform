import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Permitir acceso via Tailscale Serve (hostname tailnet) además de localhost.
      // Sin esto, Vite rechaza el request con "host not allowed".
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'desktop-hta6ms6',
        'desktop-hta6ms6.tailf8096f.ts.net',
        '.ts.net',
      ],
      // Solo escuchar en loopback; el proxy reverso es Tailscale Serve (HTTPS 443 → 127.0.0.1:4100).
      host: '127.0.0.1',
    },
  };
});
