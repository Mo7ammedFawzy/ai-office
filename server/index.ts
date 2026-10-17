import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { load, save } from './office.ts'
import { discover } from './rooms.ts'
import { createThreads, HttpError } from './threads.ts'

const PORT = 4310
const office = load()
let rooms = discover(office.projectsRoot)

const roomsMsg = () => ({ type: 'rooms', rooms: rooms.map((name) => ({ name, hidden: office.hidden.includes(name) })) })

const wss = new WebSocketServer({ noServer: true })
const broadcast = (msg: object) => {
  const s = JSON.stringify(msg)
  for (const c of wss.clients) c.send(s)
}
wss.on('connection', (ws) =>
  ws.send(JSON.stringify({ ...roomsMsg(), type: 'snapshot', threads: office.threads, maxRunning: office.maxRunning })),
)

const threads = createThreads(office, () => rooms, broadcast)

function setHidden(name: string, hide: boolean) {
  if (!rooms.includes(name)) throw new HttpError(404, 'No such Room')
  office.hidden = office.hidden.filter((n) => n !== name)
  if (hide) office.hidden.push(name)
  save(office)
  broadcast(roomsMsg())
}

type Route = [method: string, path: RegExp, handle: (m: string[], body: any) => unknown]
const routes: Route[] = [
  ['POST', /^\/api\/rooms\/refresh$/, () => {
    rooms = discover(office.projectsRoot)
    broadcast(roomsMsg())
  }],
  ['POST', /^\/api\/rooms\/([^/]+)\/(hide|show)$/, (m) => setHidden(m[1], m[2] === 'hide')],
  ['POST', /^\/api\/threads$/, (_, body) => threads.start(body)],
  ['POST', /^\/api\/threads\/([^/]+)\/send$/, (m, body) => threads.send(m[1], body.text)],
  ['POST', /^\/api\/threads\/([^/]+)\/answer$/, (m, body) => threads.answer(m[1], body)],
  ['POST', /^\/api\/threads\/([^/]+)\/(interrupt|stop|done|retry|end|discard)$/, (m) => threads.act(m[1], m[2])],
  ['GET', /^\/api\/threads\/([^/]+)\/entries$/, (m) => threads.entries(m[1])],
]

async function api(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url!, 'http://x').pathname
  for (const [method, re, handle] of routes) {
    const m = path.match(re)
    if (!m || req.method !== method) continue
    let body: any = {}
    if (method === 'POST') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      if (raw) body = JSON.parse(raw)
    }
    const out = await handle([...m].map(decodeURIComponent), body)
    if (out === undefined) return res.writeHead(204).end()
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
  }
  res.writeHead(404).end()
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
    return api(req, res).catch((e) => {
      const status = e instanceof HttpError ? e.status : e instanceof SyntaxError ? 400 : 500
      if (status === 500) console.error(e)
      res.writeHead(status, { 'content-type': 'text/plain' }).end(e.message)
    })
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
