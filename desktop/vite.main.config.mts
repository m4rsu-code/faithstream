import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      __FAITHSTREAM_UPDATE_FEED_URL__: JSON.stringify(env.FAITHSTREAM_UPDATE_FEED_URL ?? ''),
    },
    build: {
      rollupOptions: {
        external: ['ffmpeg-static'],
      },
    },
  };
});
