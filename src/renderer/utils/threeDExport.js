import * as THREE from 'three'
import { buildSegments, getStateAtTime, getTiltAtTime } from './zoomState'

// ── Canvas helpers ────────────────────────────────────────────────────────────

function drawBackground(ctx, w, h, bg) {
  if (bg && bg.startsWith('linear-gradient')) {
    const colors = [...bg.matchAll(/#[0-9a-fA-F]{3,6}|rgba?\([^)]+\)/g)].map(m => m[0])
    const angleDeg = parseFloat((bg.match(/(\d+)deg/) || ['', '135'])[1])
    const rad = angleDeg * Math.PI / 180
    const dx = Math.sin(rad), dy = -Math.cos(rad)
    const len = Math.sqrt(w * w + h * h)
    const grad = ctx.createLinearGradient(
      w / 2 - dx * len / 2, h / 2 - dy * len / 2,
      w / 2 + dx * len / 2, h / 2 + dy * len / 2
    )
    colors.forEach((c, i) => grad.addColorStop(i / Math.max(1, colors.length - 1), c))
    ctx.fillStyle = grad
  } else {
    ctx.fillStyle = bg || '#0a0a0a'
  }
  ctx.fillRect(0, 0, w, h)
}

function makeCanvasTex(canvas) {
  const t = new THREE.CanvasTexture(canvas)
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  return t
}

function plane(w, h, mat) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
}

// ── 3D Export ─────────────────────────────────────────────────────────────────

export async function export3D({ videoUrl, zoomEvents, resolution, canvasSettings, onProgress }) {
  const W   = resolution.width
  const H   = resolution.height
  const bg  = canvasSettings?.background  ?? '#0a0a0a'
  const pad = Math.round(canvasSettings?.padding      ?? 24)
  const br  = Math.max(12, (canvasSettings?.borderRadius ?? 12) * 4)
  const shadowStr = canvasSettings?.shadow ?? 80

  // ── Video ──────────────────────────────────────────────────────────────────
  const video = document.createElement('video')
  video.src = videoUrl; video.muted = true; video.playsInline = true
  video.crossOrigin = 'anonymous'
  await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = rej; video.load() })

  // ── Renderer ───────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(W, H); renderer.setPixelRatio(1)
  renderer.setClearColor(0x000000, 1)

  const scene = new THREE.Scene()

  const FOV = 50, FOV_R = FOV * Math.PI / 180
  const d0  = (H / 2) / Math.tan(FOV_R / 2)
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 1, d0 * 12)
  camera.position.set(0, 0, d0)

  // ── Background ─────────────────────────────────────────────────────────────
  const bgC = document.createElement('canvas')
  bgC.width = 4; bgC.height = H
  drawBackground(bgC.getContext('2d'), 4, H, bg)
  const bgMesh = plane(W * 6, H * 6, new THREE.MeshBasicMaterial({ map: makeCanvasTex(bgC) }))
  bgMesh.position.z = -d0 * 0.65
  scene.add(bgMesh)

  // ── Screen: rounded corners via alpha map ──────────────────────────────────
  const maskC = document.createElement('canvas')
  maskC.width = W; maskC.height = H
  const mCtx = maskC.getContext('2d')
  mCtx.fillStyle = 'black'; mCtx.fillRect(0, 0, W, H)
  mCtx.fillStyle = 'white'
  mCtx.beginPath(); mCtx.roundRect(0, 0, W, H, br); mCtx.fill()

  const vidTex = new THREE.VideoTexture(video)
  vidTex.minFilter = THREE.LinearFilter
  vidTex.magFilter = THREE.LinearFilter
  vidTex.colorSpace = THREE.SRGBColorSpace

  const screenMesh = plane(W, H, new THREE.MeshBasicMaterial({
    map: vidTex, alphaMap: makeCanvasTex(maskC), transparent: true,
  }))

  // ── Frame / glow border ───────────────────────────────────────────────────
  const fW = W + pad * 2, fH = H + pad * 2
  const fC  = document.createElement('canvas')
  fC.width  = fW; fC.height = fH
  const fCtx = fC.getContext('2d')

  // Outer rounded rect = frame face
  const outerR = br + pad * 0.7
  fCtx.fillStyle = 'rgba(255,255,255,0.055)'
  fCtx.beginPath(); fCtx.roundRect(0, 0, fW, fH, outerR); fCtx.fill()

  // Subtle inner edge glow
  const edgeGrad = fCtx.createLinearGradient(0, 0, 0, fH)
  edgeGrad.addColorStop(0, 'rgba(255,255,255,0.10)')
  edgeGrad.addColorStop(0.5, 'rgba(255,255,255,0.02)')
  edgeGrad.addColorStop(1, 'rgba(255,255,255,0.04)')
  fCtx.fillStyle = edgeGrad
  fCtx.globalCompositeOperation = 'source-atop'
  fCtx.fillRect(0, 0, fW, fH)
  fCtx.globalCompositeOperation = 'source-over'

  // Punch transparent hole for screen area
  fCtx.globalCompositeOperation = 'destination-out'
  fCtx.beginPath(); fCtx.roundRect(pad, pad, W, H, br); fCtx.fill()
  fCtx.globalCompositeOperation = 'source-over'

  const frameMesh = plane(fW, fH, new THREE.MeshBasicMaterial({
    map: makeCanvasTex(fC), transparent: true,
  }))
  frameMesh.position.z = 2

  // ── Screen group: screen + frame tilt together ────────────────────────────
  const group = new THREE.Group()
  group.add(screenMesh)
  group.add(frameMesh)
  scene.add(group)

  // ── Drop shadow ───────────────────────────────────────────────────────────
  if (shadowStr > 0) {
    const sW = Math.round(fW * 1.8), sH = Math.round(H * 0.25)
    const sC  = document.createElement('canvas')
    sC.width  = sW; sC.height = sH
    const sCtx = sC.getContext('2d')
    const sGrad = sCtx.createRadialGradient(sW / 2, sH / 2, 0, sW / 2, sH / 2, sW * 0.44)
    const alpha = Math.min(0.88, shadowStr / 85)
    sGrad.addColorStop(0,   `rgba(0,0,0,${alpha})`)
    sGrad.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.5})`)
    sGrad.addColorStop(1,   'rgba(0,0,0,0)')
    sCtx.fillStyle = sGrad
    sCtx.ellipse(sW / 2, sH / 2, sW / 2, sH / 2, 0, 0, Math.PI * 2)
    sCtx.fill()

    const shadowMesh = plane(fW * 1.8, H * 0.25, new THREE.MeshBasicMaterial({
      map: makeCanvasTex(sC), transparent: true,
    }))
    shadowMesh.position.set(0, -fH / 2 - Math.round(shadowStr * 0.18) - 20, -30)
    scene.add(shadowMesh)
  }

  // ── Capture stream ────────────────────────────────────────────────────────
  const stream = renderer.domElement.captureStream(30)
  const chunks = []
  const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 14_000_000 })
  mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

  // ── Animation state ───────────────────────────────────────────────────────
  const segs = buildSegments(zoomEvents)

  // Estimated duration (WebM often reports Infinity)
  const estimatedDur = zoomEvents.length > 0
    ? Math.max(...zoomEvents.map(e => e.timestamp)) / 1000 + 5
    : 60

  let camX = 0, camY = 0, camZ = d0
  let tiltX = 0, tiltY = 0

  onProgress(3, '3D-Renderer startet...')
  mr.start(100)

  return new Promise((resolve, reject) => {
    mr.onstop = async () => {
      onProgress(97, 'Verpacke Video...')
      renderer.dispose()
      const blob = new Blob(chunks, { type: 'video/webm' })
      resolve(new Uint8Array(await blob.arrayBuffer()))
    }

    function tick() {
      if (video.ended || (isFinite(video.duration) && video.currentTime >= video.duration - 0.03)) {
        mr.stop(); return
      }

      const tSec = video.currentTime
      const { zoom, x, y } = getStateAtTime(tSec, segs, resolution)
      const tilt = getTiltAtTime(tSec, segs)

      // Camera: move forward for zoom, offset for pan
      const worldX  = x - W / 2
      const worldY  = H / 2 - y
      const targetZ = d0 / Math.max(zoom, 0.01)
      const targetX = worldX * (1 - 1 / Math.max(zoom, 0.01))
      const targetY = worldY * (1 - 1 / Math.max(zoom, 0.01))

      camX  += (targetX - camX)  * 0.09
      camY  += (targetY - camY)  * 0.09
      camZ  += (targetZ - camZ)  * 0.09
      tiltX += (tilt.x  - tiltX) * 0.06
      tiltY += (tilt.y  - tiltY) * 0.06

      camera.position.set(camX, camY, camZ)
      camera.lookAt(camX, camY, 0)

      group.rotation.x = tiltX
      group.rotation.y = tiltY

      vidTex.needsUpdate = true
      renderer.render(scene, camera)

      const dur = isFinite(video.duration) ? video.duration : estimatedDur
      const pct = Math.min(93, 5 + Math.round((tSec / dur) * 88))
      onProgress(pct, `3D Rendering... ${pct}%`)

      requestAnimationFrame(tick)
    }

    video.addEventListener('play', () => requestAnimationFrame(tick))
    video.play().catch(reject)
  })
}
