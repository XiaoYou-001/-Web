import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readApiConfig } from './src/config/api.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PORT')
  const apiPort = process.env.PORT || env.PORT || '3001'
  readApiConfig(loadEnv(mode, process.cwd()))
  return {
    plugins: [vue()],
    build: { manifest: true },
    server: {
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
        '/ws': { target: 'ws://127.0.0.1:8080', ws: true }
      }
    },
  }
})
