import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Building against a hosted backend (VITE_API_BASE=https://host/api) also needs permission to call that host.
  const env = loadEnv(mode, process.cwd())
  const base = env.VITE_API_BASE
  if (/service_role|^sb_secret_/.test(env.VITE_SUPABASE_ANON_KEY ?? '') ) throw new Error('VITE_SUPABASE_ANON_KEY looks like a secret key. Use the anon / publishable key instead.')
  if (env.VITE_AI_KEY) console.warn('\nRecall: this build contains a shared AI key from .env.local. Anyone who installs it can read that key.\n')
  return {
    plugins: [react(), {
      name: 'recall-extension-assets',
      // The camera-focus model runtime must ship inside the extension: Chrome does not allow remote code.
      buildStart() {
        mkdirSync('public/mediapipe', { recursive: true })
        for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) copyFileSync(`node_modules/@mediapipe/tasks-vision/wasm/${file}`, `public/mediapipe/${file}`)
      },
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
