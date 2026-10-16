import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base, damit die App sowohl lokal als auch unter
// https://<user>.github.io/<repo>/ (GitHub Pages) funktioniert.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
})
