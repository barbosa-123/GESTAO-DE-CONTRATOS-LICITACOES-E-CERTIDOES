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
    const slug = apiPath ? apiPath.split('/') : []
    const query = {}
    for (const [k, v] of url.searchParams) query[k] = v

    const event = {
      path: pathname,
      httpMethod: req.method,
      headers: req.headers,
      body: rawBody || null,
      queryStringParameters: query,
      _rawParsedBody: null
    }

    try {
      if (rawBody && req.headers['content-type']?.includes('application/json')) {
        event._rawParsedBody = JSON.parse(rawBody)
      }
    } catch {}

    const { default: handler } = await import('./api/index.js')
    const result = await handler(event)

    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v)
      }
    }

    const contentType = result.headers?.['Content-Type'] || 'application/json'
    res.setHeader('Content-Type', contentType)
    return res.status(result.statusCode || 200).send(result.body)
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
