import 'dotenv/config'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const apiPath = path.join(__dirname, 'api', 'index.js')
const apiUrl = 'file:///' + apiPath.replace(/\\/g, '/') + '?t=' + Date.now()
let apiHandler = (await import(apiUrl)).default

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  let pathname = url.pathname

  if (pathname.startsWith('/api/')) {
    let rawBody = ''
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      rawBody = Buffer.concat(chunks).toString()
    }

    const apiPath = pathname.replace('/api/', '')
    const slugParts = apiPath ? apiPath.split('/') : []

    req.query = { ...Object.fromEntries(url.searchParams), path: slugParts }
    req.body = rawBody || ''
    req.url = pathname
    req.method = req.method

    const fakeRes = {
      _status: 200,
      _headers: {},
      _body: null,
      setHeader(k, v) { this._headers[k] = v },
      status(code) { this._status = code; return this },
      send(body) { this._body = body; this._end(); },
      json(body) { this._body = JSON.stringify(body); this._headers['Content-Type'] = 'application/json'; this._end(); },
      _end() {
        for (const [k, v] of Object.entries(this._headers)) {
          res.setHeader(k, v)
        }
        res.writeHead(this._status)
        res.end(this._body || '')
      }
    }

    try {
      return await apiHandler(req, fakeRes)
    } catch (e) {
      console.error('[LOCAL] API Error:', e.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: false, erro: e.message }))
    }
  }

  if (pathname === '/') pathname = '/index.html'

  const filePath = path.join(__dirname, pathname)
  const ext = path.extname(filePath)

  try {
    const data = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
})

server.listen(PORT, () => {
  console.log(`[LOCAL] Rodando em http://localhost:${PORT}`)
})
