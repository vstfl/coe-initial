import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')?.[1] ?? 'coe-initial';
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProduction ? `/${repoName}/` : '/',
  plugins: [svelte()],
  build: {
    outDir: 'docs',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      $lib: '/src/lib'
    }
  }
});
