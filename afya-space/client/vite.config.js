import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE : sous-chemin de GitHub Pages (ex. /AFYA-SPACE_0.2/). Par défaut : racine.
export default defineConfig({ base: process.env.VITE_BASE || '/', plugins: [react()] });
