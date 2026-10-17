// The Campus scene: every visible Room on one floor, a Character per live Thread.
// GPU budget (spec): demand frameloop, animation capped at ~30 fps, pixel ratio 1, AA on, no shadows or post.
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Clone, Html, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { activityTag, doorOf, FINISH_MS, huddle, layoutCampus, lookFor, SHRINK_MS, spotFor, type HuddleSpot, type RoomLayout } from './campus.ts'
import { post, type Ask, type Thread } from './office.ts'

const CHARS = ['male-a', 'female-a', 'male-b', 'female-b', 'male-c', 'female-c', 'female-d'].map((c) => `/assets/mini/character-${c}.glb`)
const FURN = ['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'wall', 'wallWindow', 'wallDoorway', 'pottedPlant'] as const
const FURN_URLS = FURN.map((n) => `/assets/furniture/${n}.glb`)
useGLTF.preload([...CHARS, ...FURN_URLS])

const ISO = new THREE.Vector3(10, 10, 10)
const TOP = new THREE.Vector3(0, 20, 0.01)
const RING = new THREE.RingGeometry(0.22, 0.28, 32)

// Anything still moving asks for another frame; the ticker grants at most one per 33 ms.
let wantFrame = false

type View = { room?: string; n: number } // n bumps on every Fit / focus request

type Props = { rooms: string[]; threads: Thread[]; selected?: string; onSelect: (id: string) => void }

// Without WebGL the scene throws; the panels must keep working.
export class Campus extends Component<Props, { error?: string }> {
  state: { error?: string } = {}
  static getDerivedStateFromError = (e: Error) => ({ error: e.message })
  render() {
    if (this.state.error)
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-slate-400">
          The scene needs hardware WebGL. In Chrome, enable chrome://flags/#ignore-gpu-blocklist and reload.
          <br />({this.state.error})
        </div>
      )
    return <Scene {...this.props} />
  }
}

function Scene({ rooms, threads, selected, onSelect }: Props) {
  const [top, setTop] = useState(false)
  const [view, setView] = useState<View>({ n: 0 })
  const live = threads.filter((t) => !t.ended && rooms.includes(t.room))
  const deskKey = rooms.join('|') + '#' + live.map((t) => `${t.room}:${t.desk}`).join(',')
  const layout = useMemo(() => layoutCampus(rooms, live), [deskKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const focus = (room?: string) => setView((v) => ({ room, n: v.n + 1 }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return
      if (e.key === 't' || e.key === 'T') setTop((x) => !x)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // Opening a Thread from a panel flies to its Room.
  const selRoom = threads.find((t) => t.id === selected)?.room
  useEffect(() => {
    if (selRoom) focus(selRoom)
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-0 flex-1">
      <Canvas orthographic frameloop="demand" dpr={1} gl={{ antialias: true, powerPreference: 'low-power' }} camera={{ position: ISO.toArray(), zoom: 40, near: 0.1, far: 400 }}>
        <color attach="background" args={['#1c1f26']} />
        <hemisphereLight args={['#fff6e8', '#5a6070', 2.2]} />
        <directionalLight position={[4, 8, 3]} intensity={1.6} />
        <Suspense fallback={null}>
          {layout.map((L) => (
            <Room key={L.name} L={L} threads={live} selected={selected} focused={view.room === L.name} onSelect={onSelect} onFocus={() => focus(L.name)} />
          ))}
        </Suspense>
        <CameraRig layout={layout} view={view} top={top} />
        <Ticker />
      </Canvas>
      <div className="absolute bottom-3 right-3 flex gap-1 rounded-lg bg-slate-950/85 p-1 text-xs">
        {(['3D', 'Top'] as const).map((l) => (
          <button key={l} onClick={() => setTop(l === 'Top')} className={`rounded px-2 py-1 ${top === (l === 'Top') ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>
            {l}
          </button>
        ))}
        <button onClick={() => focus()} className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800" title="Frame the whole floor">
          Fit
        </button>
      </div>
    </div>
  )
}

function Ticker() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const i = setInterval(() => wantFrame && ((wantFrame = false), invalidate()), 1000 / 30)
    return () => clearInterval(i)
  }, [invalidate])
  return null
}

const roomBox = (L: RoomLayout, pad = 0.6) => new THREE.Box3(new THREE.Vector3(L.ox - 1 - pad, 0, L.oz - pad), new THREE.Vector3(L.ox + L.w + pad, 1.8, L.oz + L.d + pad))

// Orthographic isometric camera: drag pans, right-drag rotates, wheel zooms; Fit / focus fly to a box.
function CameraRig({ layout, view, top }: { layout: RoomLayout[]; view: View; top: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera, size, invalidate } = useThree()
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; zoom: number }>(undefined)
  const first = useRef(true)

  useEffect(() => {
    const L = layout.find((r) => r.name === view.room)
    const box = L ? roomBox(L) : layout.reduce((b, r) => b.union(roomBox(r)), new THREE.Box3())
    if (box.isEmpty() || !size.width) return
    const target = box.getCenter(new THREE.Vector3()).setY(0)
    const pos = target.clone().add(top ? TOP : ISO)
    const probe = new THREE.OrthographicCamera()
    probe.position.copy(pos)
    probe.lookAt(target)
    probe.updateMatrixWorld()
    let hw = 0.1
    let hh = 0.1
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(probe.matrixWorldInverse)
      hw = Math.max(hw, Math.abs(p.x))
      hh = Math.max(hh, Math.abs(p.y))
    }
    goal.current = { pos, target, zoom: Math.min(size.width / (2 * hw), size.height / (2 * hh)) * 0.92 }
    if (first.current) {
      // the first fit snaps instead of flying
      first.current = false
      camera.position.copy(pos)
      controls.current?.target.copy(target)
      camera.zoom = goal.current.zoom
      camera.updateProjectionMatrix()
      goal.current = undefined
    }
    invalidate()
  }, [view.n, top, layout.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const g = goal.current
    const c = controls.current
    if (!g || !c) return
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 7)
    camera.position.lerp(g.pos, k)
    c.target.lerp(g.target, k)
    camera.zoom += (g.zoom - camera.zoom) * k
    camera.updateProjectionMatrix()
    c.update()
    if (camera.position.distanceTo(g.pos) < 0.01 && Math.abs(camera.zoom - g.zoom) < 0.01) goal.current = undefined
    else wantFrame = true
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableRotate={!top}
      screenSpacePanning={false}
      maxPolarAngle={1.25}
      minZoom={5}
      maxZoom={300}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
      onStart={() => (goal.current = undefined)}
    />
  )
}

// Furniture Kit models, re-centred on x/z and stood on the floor.
function useKit() {
  const gltfs = useGLTF(FURN_URLS) as unknown as { scene: THREE.Group }[]
  return useMemo(() => {
    const kit = {} as Record<(typeof FURN)[number], THREE.Object3D>
    FURN.forEach((n, i) => {
      const s = gltfs[i].scene.clone()
      const b = new THREE.Box3().setFromObject(s)
      const c = b.getCenter(new THREE.Vector3())
      s.position.set(-c.x, -b.min.y, -c.z)
      kit[n] = new THREE.Group().add(s)
    })
    return kit
  }, [gltfs])
}

function Room({ L, threads, selected, focused, onSelect, onFocus }: { L: RoomLayout; threads: Thread[]; selected?: string; focused: boolean; onSelect: (id: string) => void; onFocus: () => void }) {
  const kit = useKit()
  const mine = threads.filter((t) => t.room === L.name)
  const needs = mine.filter((t) => t.asks.length > 0).length
  const door = Math.floor(L.d / 2)

  // Characters whose Thread just ended walk out before they go.
  const last = useRef(new Map<string, Thread>())
  const [leaving, setLeaving] = useState<Thread[]>([])
  const ids = mine.map((t) => t.id).join()
  useEffect(() => {
    const now = new Set(mine.map((t) => t.id))
    const gone = [...last.current.values()].filter((t) => !now.has(t.id))
    if (gone.length) setLeaving((l) => [...l.filter((t) => !now.has(t.id)), ...gone])
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void (last.current = new Map(mine.map((t) => [t.id, t])))) // the latest look, so leavers keep their Subagents
  const warm = useRef(false) // Characters on the Room's first render are already seated
  useEffect(() => void (warm.current = true), [])

  const local = (x: number, z: number) => [x - L.ox, 0, z - L.oz] as const
  const click = (e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), e.delta < 6 && onFocus())

  return (
    <group position={[L.ox, 0, L.oz]}>
      <mesh rotation-x={-Math.PI / 2} position={[L.w / 2, 0, L.d / 2]} onClick={click}>
        <planeGeometry args={[L.w, L.d]} />
        <meshLambertMaterial color={focused ? '#8a8f9c' : '#7a7f8a'} />
      </mesh>
      {Array.from({ length: L.w }, (_, x) => (
        <Clone key={'b' + x} object={x % 3 === 1 ? kit.wallWindow : kit.wall} position={[x + 0.5, 0, 0]} />
      ))}
      {Array.from({ length: L.d }, (_, z) => (
        <Clone key={'l' + z} object={z === door ? kit.wallDoorway : kit.wall} position={[0, 0, z + 0.5]} rotation-y={Math.PI / 2} />
      ))}
      <Clone object={kit.pottedPlant} position={[L.w - 0.35, 0, 0.35]} />
      {L.seats.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Clone object={kit.desk} rotation-y={Math.PI} />
          <Clone object={kit.computerScreen} position={[0, 0.38, 0.1]} />
          <Clone object={kit.computerKeyboard} position={[0, 0.38, -0.08]} />
          <Clone object={kit.chairDesk} position={[0, 0, -0.42]} />
        </group>
      ))}
      <Html position={[0.3, 0, L.d + 0.35]} zIndexRange={[10, 0]}>
        <div className={`flex translate-x-1/3 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs shadow ${focused ? 'bg-slate-100 text-slate-900' : 'bg-slate-950/85 text-slate-200 ring-1 ring-slate-700'}`}>
          <button className="font-semibold" onClick={onFocus}>
            {L.name}
          </button>
          <span className="opacity-60">
            · {mine.length} open thread{mine.length === 1 ? '' : 's'}
          </span>
          {needs > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black">{needs} need you</span>}
          <button title="Hide this Room" className="opacity-40 hover:opacity-100" onClick={() => post(`rooms/${encodeURIComponent(L.name)}/hide`)}>
            ✕
          </button>
        </div>
      </Html>
      {[...mine.map((t) => [t, false] as const), ...leaving.map((t) => [t, true] as const)].map(([t, out]) => (
        <group key={t.id}>
          <Character
            t={t}
            L={L}
            threads={threads}
            walkIn={warm.current}
            leaving={out}
            selected={t.id === selected}
            local={local}
            onSelect={onSelect}
            onGone={() => setLeaving((l) => l.filter((x) => x.id !== t.id))}
          />
          {t.subagents?.length > 0 && <Huddle t={t} L={L} threads={threads} gone={out} selected={t.id === selected} local={local} onSelect={onSelect} />}
        </group>
      ))}
    </group>
  )
}

type V = THREE.Vector3
const v3 = ([x, y, z]: readonly [number, number, number]) => new THREE.Vector3(x, y, z)

function Character(p: {
  t: Thread
  L: RoomLayout
  threads: Thread[]
  walkIn: boolean
  leaving: boolean
  selected: boolean
  local: (x: number, z: number) => readonly [number, number, number]
  onSelect: (id: string) => void
  onGone: () => void
}) {
  const { t, L, leaving, local } = p
  const gltf = useGLTF(CHARS[lookFor(t.id, CHARS.length)])
  const { root, scale, lift, mixer, arms } = useMemo(() => {
    const root = cloneSkinned(gltf.scene)
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const scale = 0.62 / (box.max.y - box.min.y)
    const bones: Record<string, THREE.Object3D> = {}
    root.traverse((o) => (bones[o.name] = o))
    const arms = (['arm-left', 'arm-right'] as const).map((n) => bones[n]).filter(Boolean).map((b) => [b, b.quaternion.clone()] as const)
    return { root, scale, lift: -box.min.y * scale, mixer: new THREE.AnimationMixer(root), arms }
  }, [gltf])
  const holder = useRef<THREE.Group>(null)
  const walk = useRef({ path: [] as V[], rot: 0, seated: false, clip: '', placed: false, phase: Math.random() * 10 })
  const invalidate = useThree((s) => s.invalidate)
  const [hover, setHover] = useState(false)

  const spot = leaving ? undefined : spotFor(t, L, p.threads)
  const door = doorOf(L)
  const inside = v3(local(door.inside.x, door.inside.z))
  const outside = v3(local(door.outside.x, door.outside.z))

  // Plan a walk whenever where the Character belongs changes.
  useEffect(() => {
    const w = walk.current
    const g = holder.current!
    const here = g.position.clone().setZ(g.position.z - (w.seated ? 0.5 : 0)) // step back out of the chair
    if (leaving) {
      w.path = [here, inside, outside]
      w.seated = false
    } else {
      const to = v3(local(spot!.x, spot!.z))
      const aisle = to.z - 0.52
      if (!w.placed && !p.walkIn) {
        g.position.copy(to)
        w.path = []
      } else {
        if (!w.placed) g.position.copy(outside)
        const start = w.placed ? [here] : [inside]
        w.path = [...start, ...(spot!.seated ? [new THREE.Vector3(start[0].x, 0, aisle), new THREE.Vector3(to.x, 0, aisle)] : []), to]
      }
      w.placed = true
      w.rot = spot!.rot
      w.seated = spot!.seated
      g.rotation.y = w.rot
    }
    invalidate()
  }, [leaving, spot?.x, spot?.z, spot?.seated, L.d]) // eslint-disable-line react-hooks/exhaustive-deps

  const setClip = (name: string) => {
    const w = walk.current
    if (w.clip === name) return
    mixer.stopAllAction()
    const clip = THREE.AnimationClip.findByName(gltf.animations, name)
    if (clip) mixer.clipAction(clip).play()
    w.clip = name
  }

  const role = t.state === 'working' || t.state === 'starting' ? 'typing' : t.state === 'needs-you' ? 'hand' : 'still'
  useFrame((state, delta) => {
    const g = holder.current
    if (!g) return
    const w = walk.current
    const dt = Math.min(delta, 0.1)
    if (w.path.length) {
      const next = w.path[0]
      const d = new THREE.Vector3(next.x - g.position.x, 0, next.z - g.position.z)
      const dist = d.length()
      if (dist > 0.02) {
        g.position.addScaledVector(d.normalize(), Math.min(dist, 1.7 * dt))
        g.rotation.y = Math.atan2(d.x, d.z)
        setClip('walk')
      } else {
        w.path.shift()
        if (!w.path.length) {
          if (leaving) return p.onGone()
          g.rotation.y = w.rot
        }
      }
    }
    if (!w.path.length) setClip(w.seated ? 'sit' : 'idle')
    for (const [b, q] of arms) b.quaternion.copy(q)
    mixer.update(dt)
    const [L2, R2] = arms.map(([b]) => b)
    const moving = w.path.length > 0
    if (L2 && R2 && !moving && !leaving) {
      const tt = state.clock.elapsedTime + w.phase
      if (role === 'typing') {
        const k = Math.sin(tt * 14) * 0.12
        L2.rotateZ(0.9 + k)
        R2.rotateZ(0.9 - k)
      } else if (role === 'hand') L2.rotateZ(2.4 + Math.sin(tt * 6) * 0.25)
    }
    if (moving || (!leaving && role !== 'still')) wantFrame = true
  })

  return (
    <group
      ref={holder}
      onClick={(e) => (e.stopPropagation(), e.delta < 6 && p.onSelect(t.id))}
      onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
      onPointerOut={() => setHover(false)}
    >
      <primitive object={root} scale={scale} position-y={lift} />
      {p.selected && (
        <mesh geometry={RING} rotation-x={-Math.PI / 2} position-y={0.015} scale={1.25}>
          <meshBasicMaterial color="#fafafa" side={THREE.DoubleSide} />
        </mesh>
      )}
      {!leaving && (
        <Html position={[0, 0.8, 0]} zIndexRange={[20, 11]}>
          <div className="-translate-x-1/2 -translate-y-full">
            <Bubble t={t} hover={hover} onSelect={() => p.onSelect(t.id)} />
          </div>
        </Html>
      )}
    </group>
  )
}

// A tag only changes after it has held still for a moment, so quick tool calls don't flicker.
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

// Asks raised by a Subagent standing on the floor show over that Subagent instead.
const huddleAsks = (t: Thread) => {
  const ids = new Set(huddle(t.subagents ?? [], Date.now()).shown.map((h) => h.sub.id))
  return t.asks.filter((a) => a.agentID && ids.has(a.agentID))
}

function AskBubble({ t, ask, label, more, onSelect }: { t: Thread; ask: Ask; label: string; more: number; onSelect: () => void }) {
  const answer = (allow: boolean) => post(`threads/${t.id}/answer`, { ask: ask.id, allow })
  return (
    <div onClick={onSelect} className="mb-2 w-56 cursor-pointer rounded-xl bg-slate-950/95 p-2 text-xs shadow-xl ring-2 ring-amber-500">
      <div className="truncate text-[11px] text-amber-300">{label}</div>
      <div className="my-1 line-clamp-3 break-words font-mono text-slate-200">{ask.title}</div>
      {ask.questions ? (
        <button className="rounded bg-amber-500 px-2 py-0.5 font-medium text-black">Answer…</button>
      ) : (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => answer(true)} className="rounded bg-amber-500 px-2 py-0.5 font-medium text-black hover:bg-amber-400">
            Allow
          </button>
          <button onClick={() => answer(false)} className="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700">
            Deny
          </button>
        </div>
      )}
      {more > 0 && <div className="mt-1 text-slate-500">+{more} more</div>}
    </div>
  )
}

function Bubble({ t, hover, onSelect }: { t: Thread; hover: boolean; onSelect: () => void }) {
  const tag = useDebounced(t.state === 'working' ? activityTag(t.tool) : undefined, 2000)
  const theirs = huddleAsks(t)
  const own = t.asks.filter((a) => !theirs.includes(a))
  if (own[0]) return <AskBubble t={t} ask={own[0]} label={t.title} more={own.length - 1} onSelect={onSelect} />
  const pill = 'cursor-pointer whitespace-nowrap rounded-full px-2 text-[10px]'
  if (t.state === 'failed') return <div onClick={onSelect} className={`${pill} bg-red-600 font-bold text-white`}>failed</div>
  if (t.state === 'idle' && hover) return <div className={`${pill} bg-slate-800/90 text-slate-300`}>…your turn</div>
  if (t.state === 'working' && tag) return <div onClick={onSelect} className={`${pill} bg-sky-900/90 text-sky-200`}>{tag}</div>
  return null
}

// Re-renders every `ms` while `on`, so lingering Subagents leave on time and clocks tick.
export function useNow(on: boolean, ms = 250) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!on) return
    const i = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(i)
  }, [on, ms])
  return on ? Date.now() : now
}

// A Thread's Subagents, beside its desk (spec: Subagents, variant A "Huddle").
function Huddle(p: { t: Thread; L: RoomLayout; threads: Thread[]; gone: boolean; selected: boolean; local: (x: number, z: number) => readonly [number, number, number]; onSelect: (id: string) => void }) {
  const { t } = p
  const spot = spotFor(t, p.L, p.threads)
  const lingering = t.subagents.some((s) => s.endedAt !== undefined && Date.now() - s.endedAt < FINISH_MS + SHRINK_MS)
  const { shown, more } = huddle(t.subagents, useNow(lingering))
  if (!spot.seated) return null
  return (
    <group position={v3(p.local(spot.x, spot.z))}>
      {shown.map((h) => (
        <SubCharacter key={h.sub.id} h={h} t={t} shrink={p.gone || h.shrink} selected={p.selected} onSelect={() => p.onSelect(t.id)} />
      ))}
      {more > 0 && !p.gone && (
        <Html position={[0.9, 0.75, 0.1]} zIndexRange={p.selected ? [40, 31] : [20, 11]}>
          <div onClick={() => p.onSelect(t.id)} className="-translate-x-1/2 cursor-pointer whitespace-nowrap rounded-full bg-violet-700 px-2 text-[10px] font-bold text-white">
            +{more} subagent{more === 1 ? '' : 's'}
          </div>
        </Html>
      )}
    </group>
  )
}

function SubCharacter({ h, t, shrink, selected, onSelect }: { h: HuddleSpot; t: Thread; shrink: boolean; selected: boolean; onSelect: () => void }) {
  const { sub } = h
  const gltf = useGLTF(CHARS[lookFor(sub.id, CHARS.length)])
  const { root, scale, lift, mixer } = useMemo(() => {
    const root = cloneSkinned(gltf.scene)
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const scale = h.size / (box.max.y - box.min.y)
    const mixer = new THREE.AnimationMixer(root)
    const idle = THREE.AnimationClip.findByName(gltf.animations, 'idle')
    if (idle) mixer.clipAction(idle).play()
    return { root, scale, lift: -box.min.y * scale, mixer }
  }, [gltf, h.size])
  const holder = useRef<THREE.Group>(null)
  const invalidate = useThree((s) => s.invalidate)
  const [hover, setHover] = useState(false)
  useEffect(() => invalidate(), [shrink, invalidate])

  // Pops in on the spot, shrinks away on the spot.
  useFrame((_, delta) => {
    const g = holder.current
    if (!g) return
    const dt = Math.min(delta, 0.1)
    const k = THREE.MathUtils.clamp(g.scale.x + (shrink ? -dt : dt) * (1000 / SHRINK_MS), 0.001, 1)
    g.scale.setScalar(k)
    mixer.update(dt)
    if (sub.status === 'running' || (shrink ? k > 0.001 : k < 1)) wantFrame = true
  })

  const ask = t.asks.find((a) => a.agentID === sub.id)
  const name = `${sub.depth > 1 ? '↳ ' : ''}${sub.type}`
  const pill = 'max-w-[180px] cursor-pointer truncate whitespace-nowrap rounded-full px-2 text-[10px]'
  return (
    <group ref={holder} scale={0.001} position={[h.dx, 0, h.dz]} rotation-y={-0.5} onClick={(e) => (e.stopPropagation(), e.delta < 6 && onSelect())} onPointerOver={(e) => (e.stopPropagation(), setHover(true))} onPointerOut={() => setHover(false)}>
      <primitive object={root} scale={scale} position-y={lift} />
      {!shrink && (
        <Html position={[0, h.size + 0.12, 0]} zIndexRange={selected || ask ? [40, 31] : [20, 11]}>
          <div className="-translate-x-1/2 -translate-y-full" onClick={onSelect}>
            {ask ? (
              <AskBubble t={t} ask={ask} label={`${t.title} · its ${sub.type} Subagent`} more={0} onSelect={onSelect} />
            ) : sub.status === 'completed' ? (
              <div className={`${pill} bg-emerald-700 text-white`}>✓ {sub.summary || 'done'}</div>
            ) : sub.status === 'failed' ? (
              <div className={`${pill} bg-red-600 font-bold text-white`}>✕ failed</div>
            ) : sub.status === 'stopped' ? (
              <div className={`${pill} bg-slate-700 text-slate-200`}>✕ stopped</div>
            ) : (
              <div className={`${pill} bg-violet-950/90 text-violet-100 ring-1 ring-violet-500/60`}>
                <b>{name}</b> · {sub.summary || sub.description}
                {hover && ` · ${sub.tools} tools`}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}
