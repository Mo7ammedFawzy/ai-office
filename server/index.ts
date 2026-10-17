import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { load, save } from './office.ts'
import { discover } from './rooms.ts'

const PORT = 4310
const office = load()
let rooms = discover(office.projectsRoot)

const roomsMsg = () => ({ type: 'rooms', rooms: rooms.map((name) => ({ name, hidden: office.hidden.includes(name) })) })

const wss = new WebSocketServer({ noServer: true })
const broadcast = (msg: object) => {
  const s = JSON.stringify(msg)
  for (const c of wss.clients) c.send(s)
}
wss.on('connection', (ws) => ws.send(JSON.stringify({ ...roomsMsg(), type: 'snapshot' })))

// Commands. Each returns an HTTP status.
function command(path: string): number {
  if (path === '/api/rooms/refresh') {
    rooms = discover(office.projectsRoot)
  } else {
    const m = path.match(/^\/api\/rooms\/([^/]+)\/(hide|show)$/)
    const name = m && decodeURIComponent(m[1])
    if (!m || !name || !rooms.includes(name)) return 404
    office.hidden = office.hidden.filter((n) => n !== name)
    if (m[2] === 'hide') office.hidden.push(name)
    save(office)
  }
  broadcast(roomsMsg())
  return 204
}

// The Office starts shell-capable agents, so only same-origin pages may drive it.
const foreign = (req: IncomingMessage) => !!req.headers.origin && new URL(req.headers.origin).host !== req.headers.host

const dist = fileURLToPath(new URL('../web/dist', import.meta.url))
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json',
}
function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const p = normalize(join(dist, decodeURIComponent(new URL(req.url!, 'http://x').pathname)))
  const f = p.startsWith(dist) && existsSync(p) && statSync(p).isFile() ? p : join(dist, 'index.html')
  res.setHeader('content-type', types[extname(f)] ?? 'application/octet-stream')
  createReadStream(f).pipe(res)
}

const server = createServer((req, res) => {
  if (req.url!.startsWith('/api/')) {
    if (foreign(req)) return res.writeHead(403).end()
    if (req.method !== 'POST') return res.writeHead(405).end()
    return res.writeHead(command(req.url!.split('?')[0])).end()
  }
  web(req, res)
})

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') return // Vite's HMR socket handles its own upgrades
  if (foreign(req)) return socket.destroy()
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

let web: (req: IncomingMessage, res: ServerResponse) => void = serveStatic
if (process.env.NODE_ENV !== 'production') {
  const vite = await (await import('vite')).createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  web = (req, res) => vite.middlewares(req, res)
}

server.listen(PORT, '127.0.0.1', () => console.log(`AI Office on http://localhost:${PORT}`))
