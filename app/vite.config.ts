import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5180 },
  preview: { host: true, port: 4180 },
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
})
