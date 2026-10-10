/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: 'index.html',
        crewlab: 'crew-lab/index.html',
        shiplab: 'ship-lab/index.html',
        newrun: 'new-run/index.html',
        upgrades: 'upgrades/index.html',
        salvage: 'salvage/index.html',
        crewdb: 'crew-db/index.html',
        sounds: 'sounds/index.html',
      },
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
