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
      },
      // 忽略编辑器（VS Code 等）保存时产生的交换/临时文件，避免 Windows 下
      // watcher 监听被加锁的 *.tmp / *.tmpdir 文件触发 EBUSY 而崩溃。
      watch: {
        ignored: ['**/.*.tmp', '**/.*.tmpdir/**', '**/*.tmp']
      }
    },
  }
})
