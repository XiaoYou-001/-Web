import { build } from 'vite'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const directory = new URL('../src/offline/', import.meta.url)

// One standalone reader is shared by development and production. It has no
// runtime dependency on Vite's dev server, the main SPA, or private API calls.
async function compileReader(base) {
  const output = await build({
    configFile: false, publicDir: false, logLevel: 'silent',
    build: {
      write: false, target: 'es2020',
      lib: { entry: fileURLToPath(new URL('reader.js', directory)), name: 'OfflineTrips', formats: ['iife'] }
    }
  })
  const js = output[0].output.find(file => file.type === 'chunk').code
  const template = await readFile(new URL('reader.html', directory), 'utf8')
  const worker = await readFile(new URL('worker.js', directory), 'utf8')
  const revision = createHash('sha256').update(js).update(template).update(worker).digest('hex').slice(0, 16)
  const scriptName = 'offline-reader-' + revision + '.js'
  return new Map([
    [scriptName, js],
    ['offline.html', template.replace('READER_SCRIPT', base + scriptName)],
    ['offline-sw.js', worker.replaceAll('BUILD_REVISION', revision)]
  ])
}

export function offlineReader() {
  let files, base
  const getFiles = () => files ??= compileReader(base)
  return {
    name: 'offline-trip-reader',
    configResolved(config) { base = config.base },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = req.url.split('?')[0].split('/').pop()
        if (!/^(offline\.html|offline-sw\.js|offline-reader-[a-f0-9]{16}\.js)$/.test(name)) return next()
        try {
          const source = (await getFiles()).get(name)
          if (source === undefined) return next()
          res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(source)
        } catch (error) { next(error) }
      })
      server.watcher.on('change', path => {
        if (/[\\/]src[\\/]/.test(path)) files = null
      })
    },
    async generateBundle() {
      for (const [fileName, source] of await getFiles()) this.emitFile({type:'asset', fileName, source})
    }
  }
}
