import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/dndbeyond-api': {
        target: 'https://character-service.dndbeyond.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dndbeyond-api/, ''),
      },
    }
  }
})