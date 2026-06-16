const ffmpegPath = require('ffmpeg-static')
const { spawn }  = require('child_process')
const fs         = require('fs')

const ZOOM_IN_SEC  = 0.45
const ZOOM_OUT_SEC = 0.45
const PAN_SEC      = 0.55

// ── Segment builder (mirrors EditorView logic) ────────────────────────────────

function buildSegments(events) {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)
  const segs = []
  let state = 'out', curZoom = 1, curX = 0, curY = 0

  for (const ev of sorted) {
    if (ev.type === 'zoom-in') {
      if (state === 'out') {
        const t0 = ev.timestamp / 1000
        segs.push({ kind: 'zoom-in', t0, t1: t0 + ZOOM_IN_SEC,
          fromZoom: 1, toZoom: ev.zoomLevel, x: ev.x, y: ev.y })
        curZoom = ev.zoomLevel; curX = ev.x; curY = ev.y; state = 'in'
      } else {
        const t0 = ev.timestamp / 1000
        segs.push({ kind: 'pan', t0, t1: t0 + PAN_SEC,
          zoom: curZoom, fromX: curX, fromY: curY, toX: ev.x, toY: ev.y })
        curX = ev.x; curY = ev.y
      }
    } else if (ev.type === 'zoom-out' && state === 'in') {
      const t0 = ev.timestamp / 1000
      segs.push({ kind: 'zoom-out', t0, t1: t0 + ZOOM_OUT_SEC,
        fromZoom: curZoom, x: curX, y: curY })
      curZoom = 1; state = 'out'
    }
  }
  return segs
}

// ── FFmpeg expression helpers ─────────────────────────────────────────────────

// easeInOutCubic approximated in ffmpeg expression syntax
function ease(tExpr) {
  return `if(lt(${tExpr},0.5),4*pow(${tExpr},3),1-pow(-2*(${tExpr})+2,3)/2)`
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

// Build the zoompan filter from segments
function buildFilter(segs, W, H) {
  if (segs.length === 0) return `scale=${W}:${H}`

  let zExpr = ''
  let xExpr = ''
  let yExpr = ''
  let opens = 0

  for (const seg of segs) {
    const { t0, t1 } = seg
    const dur = (t1 - t0).toFixed(4)
    const p = `clamp((t-${t0.toFixed(4)})/${dur},0,1)` // [0,1] progress

    if (seg.kind === 'zoom-in') {
      const dz = seg.toZoom - seg.fromZoom
      zExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${seg.fromZoom}+${dz}*${ease(p)},`
      const tx = clamp(seg.x - W / seg.toZoom / 2, 0, W - W / seg.toZoom)
      xExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${tx.toFixed(1)},`
      const ty = clamp(seg.y - H / seg.toZoom / 2, 0, H - H / seg.toZoom)
      yExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${ty.toFixed(1)},`
    } else if (seg.kind === 'pan') {
      zExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${seg.zoom},`
      const fx = clamp(seg.fromX - W / seg.zoom / 2, 0, W - W / seg.zoom)
      const tx = clamp(seg.toX   - W / seg.zoom / 2, 0, W - W / seg.zoom)
      xExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${fx.toFixed(1)}+(${(tx-fx).toFixed(1)})*${ease(p)},`
      const fy = clamp(seg.fromY - H / seg.zoom / 2, 0, H - H / seg.zoom)
      const ty2 = clamp(seg.toY  - H / seg.zoom / 2, 0, H - H / seg.zoom)
      yExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${fy.toFixed(1)}+(${(ty2-fy).toFixed(1)})*${ease(p)},`
    } else if (seg.kind === 'zoom-out') {
      const dz = 1 - seg.fromZoom
      zExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${seg.fromZoom}+${dz.toFixed(4)}*${ease(p)},`
      const tx = clamp(seg.x - W / seg.fromZoom / 2, 0, W - W / seg.fromZoom)
      xExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${tx.toFixed(1)},`
      const ty = clamp(seg.y - H / seg.fromZoom / 2, 0, H - H / seg.fromZoom)
      yExpr += `if(between(t,${t0.toFixed(4)},${t1.toFixed(4)}),${ty.toFixed(1)},`
    }
    opens++
  }

  // Determine the last active zoom so "after all events" stays at correct state
  const lastSeg = segs[segs.length - 1]
  let defaultZ, defaultX, defaultY

  if (lastSeg.kind === 'zoom-out') {
    defaultZ = '1'; defaultX = 'iw/2-(iw/zoom/2)'; defaultY = 'ih/2-(ih/zoom/2)'
  } else {
    const holdZoom = lastSeg.kind === 'pan' ? lastSeg.zoom : lastSeg.toZoom
    const holdX    = lastSeg.kind === 'pan' ? lastSeg.toX  : lastSeg.x
    const holdY    = lastSeg.kind === 'pan' ? lastSeg.toY  : lastSeg.y
    const hx = clamp(holdX - W / holdZoom / 2, 0, W - W / holdZoom)
    const hy = clamp(holdY - H / holdZoom / 2, 0, H - H / holdZoom)
    defaultZ = `${holdZoom}`
    defaultX = `${hx.toFixed(1)}`
    defaultY = `${hy.toFixed(1)}`
  }

  const close = ')'.repeat(opens)
  return `zoompan=z='${zExpr}${defaultZ}${close}':x='${xExpr}${defaultX}${close}':y='${yExpr}${defaultY}${close}':d=1:s=${W}x${H}:fps=30`
}

// ── Main export ───────────────────────────────────────────────────────────────

async function process({ videoPath, metaPath, zoomEvents, outputPath, onProgress, canvasSettings }) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  const { width: W, height: H } = meta.resolution
  const segs = buildSegments(zoomEvents || [])

  let vf = buildFilter(segs, W, H)

  // Apply canvas padding + background color (solid only, gradients not supported in ffmpeg)
  if (canvasSettings && canvasSettings.padding > 0) {
    const p   = Math.round(canvasSettings.padding)
    const bg  = canvasSettings.background
    const hex = bg.startsWith('#') ? bg.replace('#', '') : '0a0a0a'
    const padW = W + p * 2
    const padH = H + p * 2
    vf = `${vf},pad=${padW}:${padH}:${p}:${p}:color=0x${hex}`
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', videoPath,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    ]

    onProgress(5, 'FFmpeg startet...')
    const ff = spawn(ffmpegPath, args)
    let durSec = null, errBuf = ''

    ff.stderr.on('data', d => {
      const s = d.toString()
      errBuf += s
      if (!durSec) {
        const m = s.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
        if (m) durSec = +m[1]*3600 + +m[2]*60 + +m[3]
      }
      const tm = s.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (tm && durSec) {
        const el  = +tm[1]*3600 + +tm[2]*60 + +tm[3]
        const pct = Math.min(95, 5 + Math.round(el / durSec * 90))
        onProgress(pct, `Rendering... ${pct}%`)
      }
    })

    ff.on('close', code => {
      if (code === 0) { onProgress(100, 'Fertig!'); resolve() }
      else reject(new Error(`FFmpeg Code ${code}:\n${errBuf.slice(-600)}`))
    })
    ff.on('error', reject)
  })
}

module.exports = { process }
