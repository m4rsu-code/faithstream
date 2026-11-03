import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const adminRoot = fileURLToPath(new URL('.', import.meta.url));
const desktopLogo = resolve(adminRoot, '../desktop/src/assets/img/Logo.png');

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    fs: {
      allow: [adminRoot, desktopLogo],
    },
  },
});
