import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 相对路径打包，便于纯静态部署到任意子路径
export default defineConfig({
  base: './',
  plugins: [react()],
})