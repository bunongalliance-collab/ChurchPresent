import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { recordVisit } from './api/_visit-core.js'
import { recordInstall } from './api/_install-core.js'
import { fileURLToPath } from 'node:url'

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

// Local stand-in for api/visit.js, so visit logging works in `npm run dev`.
// There are no Vercel location headers locally, so city and country stay empty and the IP is the local one.
function visitDevProxy(supabaseUrl: string, anonKey: string, serviceKey: string): Plugin {
  return {
    name: 'visit-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/visit', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'method not allowed' })); return }
        const headers = { ...req.headers, 'x-forwarded-for': String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') }
        const { status, body } = await recordVisit({ headers, supabaseUrl, anonKey, serviceKey })
        res.statusCode = status
        if (body === null) { res.end(); return }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      })
    },
  }
}

// Local stand-in for api/install.js (Nau Mpro install count), so it works in `npm run dev`.
function installDevProxy(supabaseUrl: string, serviceKey: string): Plugin {
  return {
    name: 'install-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/install', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'method not allowed' })); return }
        let raw = ''
        for await (const chunk of req) raw += chunk
        let body = null
        try { body = JSON.parse(raw) } catch { /* not JSON: recordInstall answers 400 */ }
        const { status, body: out } = await recordInstall({ headers: req.headers, body, supabaseUrl, serviceKey })
        res.statusCode = status
        if (out === null) { res.end(); return }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(out))
      })
    },
  }
}

// The PWA plugin adds the team app's manifest link to every page. The reader has its own,
// so remove the extra one there (the reader installs as "Nau Mpro", not as the team app).
function readerOwnManifest(): Plugin {
  return {
    name: 'reader-own-manifest',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.path.startsWith('/nau-mpro/') && !ctx.path.startsWith('/scripture/')) return html
        return html.replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest"\s*\/?>/g, '')
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      yvDevProxy(env.YV_APP_KEY ?? ''),
      // SUPABASE_SERVICE_ROLE_KEY: server only (no VITE_ prefix), read from app/.env.local; never bundled into the page
      visitDevProxy(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_ANON_KEY ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
      installDevProxy(env.VITE_SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
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
          // The main bundle is about 2.3 MB; the default 2 MB limit left it out of the offline cache
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // The Nau Mpro reader's manifest and lyric fonts are saved too, so the reader opens offline
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'nau-mpro/*.webmanifest', 'scripture/*.webmanifest', 'fonts/NotoSerif-*.ttf'],
          // Reader fonts: only the Latin and Vietnamese letter sets are needed
          globIgnores: ['**/*-cyrillic-*.woff2', '**/*-cyrillic-ext-*.woff2', '**/*-greek-*.woff2', '**/*-greek-ext-*.woff2'],
          navigateFallback: 'index.html',
          // The reader is its own page: never answer it with the team app's page
          navigateFallbackDenylist: [/^\/nau-mpro/, /^\/scripture/],
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
              // Nau Mpro score scans: a score opened once is kept, so it shows offline afterwards
              urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/hymn-scores/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'hymn-scores',
                expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // The reader's Alegreya fonts (Google Fonts): kept after the first visit
              urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'reader-fonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
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
      readerOwnManifest(),
    ],
    // Two pages: the team app, and the Nau Mpro reader at /nau-mpro/
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          reader: fileURLToPath(new URL('./nau-mpro/index.html', import.meta.url)),
          scripture: fileURLToPath(new URL('./scripture/index.html', import.meta.url)),
        },
      },
    },
  }
})
