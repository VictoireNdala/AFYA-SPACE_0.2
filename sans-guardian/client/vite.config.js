import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dashboard talks to the onboard server through a same-origin proxy (works offline on one machine).
const target = process.env.SG_API ?? 'http://localhost:3001';

export default defineConfig({
  // VITE_BASE: sub-path of the static demo on GitHub Pages (e.g. /AFYA-SPACE_0.2/sans-guardian/). Default: root.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? 5173),
    proxy: {
      '/api': { target, changeOrigin: true },
      '/stream': { target: target.replace(/^http/, 'ws'), ws: true },
    },
  },
});
