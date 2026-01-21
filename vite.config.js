import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // START CHANGE: Set Base URL to match your app's path
  base: '/dungeonmind/',
  // END CHANGE
  server: {
    // START CHANGE: Redirect 404s to index.html (SPA Fallback)
    historyApiFallback: true,
    // END CHANGE
  }
})