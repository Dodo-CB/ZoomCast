import React, { useRef, useEffect, useState } from 'react'
import { buildSegments } from '../utils/zoomState'

const RULER_H = 24
const VIDEO_H = 68
const ZOOM_H  = 34
const TOTAL_H = RULER_H + VIDEO_H + ZOOM_H + 8

// ── Thumbnail extraction ──────────────────────────────────────────────────────

function useThumbnails(videoUrl, duration) {
  const [thumbs, setThumbs] = useState([])

  useEffect(() => {
    if (!videoUrl || !duration || duration <= 0) return
    let cancelled = false

    const THUMB_N = 28
    const TW = 192, TH = 108
    const vid    = document.createElement('video')
    vid.src = videoUrl
    vid.muted = true
    const canvas = document.createElement('canvas')
    canvas.width = TW; canvas.height = TH
    const ctx = canvas.getContext('2d')

    async function extract() {
      await new Promise(r => { vid.onloadeddata = r; vid.load() })
      const result = []
      for (let i = 0; i < THUMB_N; i++) {
        if (cancelled) return
        vid.currentTime = (i / (THUMB_N - 1)) * duration
        await new Promise(r => { vid.onseeked = r })
        ctx.drawImage(vid, 0, 0, TW, TH)
        result.push(canvas.toDataURL('image/jpeg', 0.78))
        if (i % 4 === 0) setThumbs([...result])
      }
      setThumbs([...result])
    }

    extract().catch(() => {})
    return () => { cancelled = true }
  }, [videoUrl, duration])

  return thumbs
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export default function Timeline({
  duration, currentTime, zoomEvents, selectedEvent,
  onSeek, onSelectEvent, onChangeEvent, videoUrl,
}) {
  const containerRef = useRef(null)
  const [width, setWidth]                     = useState(0)
  const [isDraggingHead, setIsDraggingHead]   = useState(false)
  const [draggingMarkerId, setDraggingMarkerId] = useState(null)
  const [hoverX, setHoverX]                   = useState(null)
  const thumbs = useThumbnails(videoUrl, duration)

  // Stable refs so drag handlers never go stale
  const onSeekRef   = useRef(onSeek)
  const onChangeRef = useRef(onChangeEvent)
  const widthRef    = useRef(width)
  const durRef      = useRef(0)
  useEffect(() => { onSeekRef.current   = onSeek       }, [onSeek])
  useEffect(() => { onChangeRef.current = onChangeEvent }, [onChangeEvent])
  useEffect(() => { widthRef.current    = width         }, [width])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth))
    ro.observe(el)
    setWidth(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

  const safeDur = isFinite(duration) && duration > 0 ? duration : 0
  durRef.current = safeDur

  const toX = t => safeDur > 0 ? (t / safeDur) * width : 0

  function fromXRef(px) {
    const d = durRef.current, w = widthRef.current
    return d > 0 ? Math.max(0, Math.min(d, (px / w) * d)) : 0
  }

  // Document-level drag
  useEffect(() => {
    if (!isDraggingHead && draggingMarkerId === null) return

    function onMove(e) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const t = fromXRef(e.clientX - rect.left)
      if (isDraggingHead) {
        onSeekRef.current(t)
      } else {
        onChangeRef.current?.(draggingMarkerId, { timestamp: Math.round(t * 1000) })
      }
    }

    function onUp() {
      setIsDraggingHead(false)
      setDraggingMarkerId(null)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [isDraggingHead, draggingMarkerId])

  // Time ruler marks
  const step = safeDur > 120 ? 30 : safeDur > 60 ? 10 : safeDur > 20 ? 5 : 2
  const marks = []
  for (let t = 0; t <= safeDur; t += step) marks.push(t)

  // Zoom regions for track visualization
  const segs = buildSegments(zoomEvents)
  const zoomRegions = []
  for (let i = 0; i < segs.length; i++) {
    const seg  = segs[i]
    const next = segs[i + 1]
    if (seg.kind === 'zoom-in') {
      zoomRegions.push({ t0: seg.t0, t1: seg.t1, kind: 'in' })
      const holdEnd = next ? next.t0 : seg.t1
      if (holdEnd > seg.t1) zoomRegions.push({ t0: seg.t1, t1: holdEnd, kind: 'hold' })
    } else if (seg.kind === 'pan') {
      zoomRegions.push({ t0: seg.t0, t1: seg.t1, kind: 'pan' })
      const holdEnd = next ? next.t0 : seg.t1
      if (holdEnd > seg.t1) zoomRegions.push({ t0: seg.t1, t1: holdEnd, kind: 'hold' })
    } else if (seg.kind === 'zoom-out') {
      zoomRegions.push({ t0: seg.t0, t1: seg.t1, kind: 'out' })
    }
  }

  const playX     = toX(currentTime)
  const hoverTime = hoverX !== null ? fromXRef(hoverX) : null

  const regionColors = {
    in:   'rgba(139,92,246,0.75)',
    hold: 'rgba(139,92,246,0.22)',
    pan:  'rgba(59,130,246,0.7)',
    out:  'rgba(255,255,255,0.10)',
  }

  return (
    <div
      ref={containerRef}
      onClick={e => {
        if (isDraggingHead || draggingMarkerId !== null) return
        const rect = containerRef.current.getBoundingClientRect()
        onSeek(fromXRef(e.clientX - rect.left))
      }}
      onMouseMove={e => {
        const rect = containerRef.current.getBoundingClientRect()
        setHoverX(e.clientX - rect.left)
      }}
      onMouseLeave={() => setHoverX(null)}
      className="relative select-none flex-shrink-0"
      style={{
        height: TOTAL_H,
        background: '#0c0c0c',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        cursor: isDraggingHead ? 'col-resize' : 'pointer',
      }}
    >

      {/* ── Hover time tooltip ────────────────────────────────────── */}
      {hoverTime !== null && !isDraggingHead && draggingMarkerId === null && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{ left: Math.max(22, Math.min(hoverX, width - 22)), top: 2, transform: 'translateX(-50%)' }}
        >
          <div style={{
            background: 'rgba(18,18,18,0.92)',
            border: '1px solid rgba(255,255,255,0.11)',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 9,
            color: 'rgba(255,255,255,0.65)',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}>
            {fmt(hoverTime)}
          </div>
        </div>
      )}

      {/* ── Time ruler ───────────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{ height: RULER_H, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {marks.map(t => (
          <div
            key={t}
            className="absolute flex flex-col items-center"
            style={{ left: toX(t), transform: 'translateX(-50%)' }}
          >
            <div style={{ width: 1, height: 7, background: 'rgba(255,255,255,0.18)', marginTop: 4 }} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', marginTop: 1 }}>
              {fmt(t)}
            </span>
          </div>
        ))}

        {/* Playhead time label */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.max(2, Math.min(playX - 1, width - 42)),
            top: 4,
            fontSize: 9,
            color: '#a78bfa',
            fontFamily: 'monospace',
            fontWeight: 600,
          }}
        >
          {fmt(currentTime)}
        </div>
      </div>

      {/* ── Video thumbnail strip ─────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 overflow-hidden"
        style={{ top: RULER_H, height: VIDEO_H }}
      >
        {thumbs.length > 0 ? (
          <div className="flex h-full w-full">
            {thumbs.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                draggable={false}
                className="h-full flex-1 object-cover"
                style={{ minWidth: 0, pointerEvents: 'none' }}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.14)' }}>Lade Vorschau...</span>
          </div>
        )}
        {/* Darkening overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.32)' }} />
        {/* Fade into zoom track */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{
          height: 18,
          background: 'linear-gradient(to bottom, transparent, rgba(12,12,12,0.75))',
        }} />
      </div>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div className="absolute left-0 right-0 pointer-events-none" style={{
        top: RULER_H + VIDEO_H, height: 1, background: 'rgba(255,255,255,0.06)',
      }} />

      {/* ── Zoom events track ────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0"
        style={{ top: RULER_H + VIDEO_H + 1, height: ZOOM_H }}
      >
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.22)' }} />

        {/* Colored segment blocks */}
        {zoomRegions.map((r, i) => {
          const x1 = toX(r.t0)
          const x2 = toX(r.t1)
          const w  = Math.max(2, x2 - x1)
          return (
            <div
              key={i}
              className="absolute rounded-sm pointer-events-none"
              style={{ left: x1, width: w, top: 7, bottom: 7, background: regionColors[r.kind] }}
            />
          )
        })}

        {/* Track label */}
        <div className="absolute top-0 left-2 bottom-0 flex items-center pointer-events-none">
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.16)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
            Zoom
          </span>
        </div>

        {/* Zoom event markers */}
        {zoomEvents.map(ev => {
          const x          = toX(ev.timestamp / 1000)
          const isOut      = ev.type === 'zoom-out'
          const isSelected = selectedEvent?.id === ev.id
          const isDragging = draggingMarkerId === ev.id
          return (
            <div
              key={ev.id}
              onMouseDown={e => {
                e.stopPropagation()
                setDraggingMarkerId(ev.id)
                onSelectEvent(ev)
              }}
              onClick={e => {
                e.stopPropagation()
                onSelectEvent(ev)
                onSeek(ev.timestamp / 1000)
              }}
              className="absolute top-0 bottom-0 flex items-center justify-center"
              style={{
                left: x,
                transform: 'translateX(-50%)',
                width: 22,
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: 2,
              }}
            >
              <div style={{
                width:  isSelected || isDragging ? 13 : 11,
                height: isSelected || isDragging ? 13 : 11,
                borderRadius: '50%',
                background: isSelected
                  ? '#fbbf24'
                  : isOut ? 'rgba(255,255,255,0.55)' : '#8b5cf6',
                border: `2px solid ${
                  isSelected ? '#fcd34d' : isOut ? 'rgba(255,255,255,0.85)' : '#c4b5fd'
                }`,
                boxShadow: isDragging
                  ? '0 0 10px rgba(139,92,246,0.9)'
                  : isSelected
                  ? '0 0 8px rgba(251,191,36,0.55)'
                  : 'none',
                transition: 'width 0.1s, height 0.1s, box-shadow 0.15s',
              }} />
            </div>
          )
        })}
      </div>

      {/* ── Playhead ─────────────────────────────────────────────── */}
      <div
        className="absolute top-0 bottom-0 z-20 pointer-events-none"
        style={{ left: playX, width: 1, background: 'rgba(167,139,250,0.85)' }}
      >
        {/* Draggable diamond handle */}
        <div
          onMouseDown={e => {
            e.stopPropagation()
            setIsDraggingHead(true)
          }}
          style={{
            position: 'absolute',
            top: -3,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 14,
            height: 14,
            background: isDraggingHead ? '#c4b5fd' : '#a78bfa',
            borderRadius: 3,
            clipPath: 'polygon(50% 0%, 100% 42%, 50% 100%, 0% 42%)',
            cursor: 'col-resize',
            pointerEvents: 'all',
            boxShadow: isDraggingHead
              ? '0 0 10px rgba(167,139,250,0.9)'
              : '0 0 5px rgba(167,139,250,0.55)',
            transition: 'background 0.1s, box-shadow 0.1s',
          }}
        />
      </div>
    </div>
  )
}

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
