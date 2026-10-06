import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:8080'
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || 'localhost')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  const routes = [
    '/auth', '/devices', '/homes', '/smartthings', '/automations',
    '/settings', '/notifications', '/weather', '/xiaomi', '/scale',
    '/llm', '/health',
  ]

  return {
    plugins: [react()],
    server: {
      host: true,
      allowedHosts,
      proxy: Object.fromEntries(routes.map((route) => [route, backendTarget])),
    },
  }
})
