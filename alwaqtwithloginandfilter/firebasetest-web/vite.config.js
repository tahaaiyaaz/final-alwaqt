import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/uploads': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/api': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/searchMasjidsWithOla': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/getNearestMasjid': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/addMasjid': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/updateMasjid': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/health': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/signupwithmobile': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/updateUser': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/getFavoriteMasjids': {
        target: 'https://masjidtimings.masjidtimings.com',
        changeOrigin: true,
        secure: true,
      },
      '/ola-api': {
        target: 'https://api.olamaps.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ola-api/, ''),
      },
      '/osm': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/osm/, ''),
        headers: {
          'User-Agent': 'MasjidTimingsApp/1.0' // Nominatim requires a User-Agent
        }
      }
    }
  }
})
