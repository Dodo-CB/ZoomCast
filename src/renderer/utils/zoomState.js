export const ZOOM_IN_MS  = 450
export const ZOOM_OUT_MS = 450
export const PAN_MS      = 550

export function easeInOutCubic(t) {
  t = Math.max(0, Math.min(1, t))
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Convert flat event list → animation segments
export function buildSegments(events) {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)
  const segs = []
  let state = 'out', curZoom = 1, curX = 0, curY = 0

  for (const ev of sorted) {
    if (ev.type === 'zoom-in') {
      if (state === 'out') {
        segs.push({ kind: 'zoom-in',
          t0: ev.timestamp / 1000, t1: (ev.timestamp + ZOOM_IN_MS) / 1000,
          fromZoom: 1, toZoom: ev.zoomLevel, x: ev.x, y: ev.y })
        curZoom = ev.zoomLevel; curX = ev.x; curY = ev.y; state = 'in'
      } else {
        segs.push({ kind: 'pan',
          t0: ev.timestamp / 1000, t1: (ev.timestamp + PAN_MS) / 1000,
          zoom: curZoom, fromX: curX, fromY: curY, toX: ev.x, toY: ev.y })
        curX = ev.x; curY = ev.y
      }
    } else if (ev.type === 'zoom-out' && state === 'in') {
      segs.push({ kind: 'zoom-out',
        t0: ev.timestamp / 1000, t1: (ev.timestamp + ZOOM_OUT_MS) / 1000,
        fromZoom: curZoom, x: curX, y: curY })
      curZoom = 1; state = 'out'
    }
  }
  return segs
}

// Current zoom/position at time t (seconds)
export function getStateAtTime(tSec, segments, res) {
  const W = res?.width  || 1920
  const H = res?.height || 1080
  let zoom = 1, x = W / 2, y = H / 2

  for (const seg of segments) {
    if (tSec < seg.t0) break
    const done = tSec >= seg.t1
    const p    = done ? 1 : (tSec - seg.t0) / (seg.t1 - seg.t0)
    const e    = easeInOutCubic(p)

    if (seg.kind === 'zoom-in') {
      zoom = seg.fromZoom + (seg.toZoom - seg.fromZoom) * e
      x = seg.x; y = seg.y
    } else if (seg.kind === 'pan') {
      zoom = seg.zoom
      x = seg.fromX + (seg.toX - seg.fromX) * e
      y = seg.fromY + (seg.toY - seg.fromY) * e
    } else if (seg.kind === 'zoom-out') {
      zoom = seg.fromZoom + (1 - seg.fromZoom) * e
      x = seg.x; y = seg.y
    }

    if (!done) break
  }
  return { zoom, x, y }
}

// 3D tilt angle (radians) at time t — bell curve during transitions
export function getTiltAtTime(tSec, segments) {
  for (const seg of segments) {
    const margin = 0.1 // seconds past end to hold tilt
    if (tSec < seg.t0 || tSec > seg.t1 + margin) continue

    const p    = Math.max(0, Math.min(1, (tSec - seg.t0) / (seg.t1 - seg.t0)))
    const bell = Math.sin(p * Math.PI) // 0 → peak → 0

    if (seg.kind === 'zoom-in') {
      return { x: -0.22 * bell, y: 0.13 * bell }
    } else if (seg.kind === 'pan') {
      const dx = seg.toX - seg.fromX
      const dy = seg.toY - seg.fromY
      const len = Math.hypot(dx, dy) || 1
      return { x: (dy / len) * 0.16 * bell, y: -(dx / len) * 0.18 * bell }
    } else if (seg.kind === 'zoom-out') {
      return { x: 0.18 * bell, y: -0.08 * bell }
    }
  }
  return { x: 0, y: 0 }
}
