import { readFileSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Building against a hosted backend (VITE_API_BASE=https://host/api) also needs permission to call that host.
  const base = loadEnv(mode, process.cwd()).VITE_API_BASE
  return {
    plugins: [react(), {
      name: 'recall-backend-permission',
      closeBundle() {
        if (!base) return
        const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'))
        const origin = `${new URL(base).origin}/*`
        if (!manifest.host_permissions.includes(origin)) manifest.host_permissions.push(origin)
        writeFileSync('dist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
      },
    }],
  }
})
