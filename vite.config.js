import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'

// Custom plugin to copy index.html to 404.html
const copy404 = () => ({
  name: 'copy-404',
  closeBundle() {
    const dist = resolve(__dirname, 'dist')
    const index = resolve(dist, 'index.html')
    const fourOhFour = resolve(dist, '404.html')
    if (fs.existsSync(index)) {
      fs.copyFileSync(index, fourOhFour)
      console.log('✨ Created 404.html for GitHub Pages routing')
    }
  }
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copy404()],
  base: '/dungeonmind/', // <--- IMPORTANT: Ensure this matches your repo name!
})