import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Local stand-in for api/yv/[...path].js, so the scripture page works in `npm run dev`.
// Reads YV_APP_KEY from app/.env.local (no VITE_ prefix, so it is never bundled into the page).
function yvDevProxy(key: string): Plugin {
  return {
    name: 'yv-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/yv', async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const sub = url.searchParams.get('path') || ''
        url.searchParams.delete('path')
        if (!key) { res.statusCode = 500; res.end(JSON.stringify({ error: 'YV_APP_KEY is not set' })); return }
        if (!sub.startsWith('v1/') || sub.includes('..')) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' })); return }
        try {
          const up = await fetch(`https://api.youversion.com/${sub}${url.search}`, { headers: { 'X-YVP-App-Key': key } })
          res.statusCode = up.status
          res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json')
          res.end(await up.text())
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({ error: 'could not reach YouVersion' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      yvDevProxy(env.YV_APP_KEY ?? ''),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons.svg'],
        manifest: {
          name: 'Church Tools',
          short_name: 'Church Tools',
          description: 'Lyrics, scripture and presentation slides, usable offline.',
          start_url: '.',
          scope: '.',
          display: 'standalone',
          theme_color: '#213648',
          background_color: '#f4f1ea',
          icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // Songs, presentations and scripture studies: the last copy is used when offline
              urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'church-data',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Bible verses barely change, so a verse fetched once works offline afterwards
              urlPattern: ({ url }) => url.pathname.startsWith('/api/yv/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'bible-verses',
                expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
  }
})
