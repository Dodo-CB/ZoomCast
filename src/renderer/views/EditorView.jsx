import React, { useState, useRef, useEffect } from 'react'
import ZoomEventPanel from '../components/ZoomEventPanel'
import Timeline from '../components/Timeline'
import CanvasPanel from '../components/CanvasPanel'
import CursorPanel from '../components/CursorPanel'
import ClickEffectOverlay from '../components/ClickEffectOverlay'
import { buildSegments, getStateAtTime, getTiltAtTime } from '../utils/zoomState'
import { export3D } from '../utils/threeDExport'

// ── rAF preview hook ──────────────────────────────────────────────────────────

function usePreview(videoRef, wrapperRef, tiltRef, events, resolution, mode) {
  const evRef   = useRef(events)
  const resRef  = useRef(resolution)
  const modeRef = useRef(mode)
  useEffect(() => { evRef.current   = events    }, [events])
  useEffect(() => { resRef.current  = resolution }, [resolution])
  useEffect(() => { modeRef.current = mode       }, [mode])

  useEffect(() => {
    const video   = videoRef.current
    const wrapper = wrapperRef.current
    if (!video || !wrapper) return
    let rafId

    function tick() {
      const tSec = video.currentTime
      const segs = buildSegments(evRef.current)
      const res  = resRef.current
      const { zoom, x, y } = getStateAtTime(tSec, segs, res)
      const ox = res ? (x / res.width)  * 100 : 50
      const oy = res ? (y / res.height) * 100 : 50

      wrapper.style.transformOrigin = `${ox.toFixed(2)}% ${oy.toFixed(2)}%`
      wrapper.style.transform = zoom > 1.001 ? `scale(${zoom.toFixed(4)})` : 'none'

      if (modeRef.current === '3d' && tiltRef.current) {
        const { x: tx, y: ty } = getTiltAtTime(tSec, segs)
        const deg = v => `${(v * 180 / Math.PI).toFixed(2)}deg`
        tiltRef.current.style.transform = `rotateX(${deg(tx)}) rotateY(${deg(ty)})`
      } else if (tiltRef.current) {
        tiltRef.current.style.transform = 'none'
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])
}

// ── Compute canvas wrapper style from canvas settings ─────────────────────────

function getCanvasStyle(canvas) {
  const isGradient = canvas.background.startsWith('linear-gradient')
  const isSolid    = !isGradient

  const shadowPx = canvas.shadow
  const shadow = shadowPx > 0
    ? `0 ${Math.round(shadowPx * 0.5)}px ${shadowPx}px rgba(0,0,0,0.85), 0 ${Math.round(shadowPx * 0.15)}px ${Math.round(shadowPx * 0.35)}px rgba(0,0,0,0.6)`
    : 'none'

  return {
    outer: {
      background: canvas.background,
      padding: `${canvas.padding}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: shadow,
    },
    inner: {
      borderRadius: `${canvas.borderRadius}px`,
      overflow: 'hidden',
    },
  }
}

// ── Default settings ──────────────────────────────────────────────────────────

const DEFAULT_CANVAS = {
  aspectRatio: 'original',
  padding: 5,
  borderRadius: 4,
  shadow: 80,
  background: 'linear-gradient(135deg,#667eea,#764ba2)',
}

const DEFAULT_CURSOR = {
  showCursor: true,
  cursorSize: 3.0,
  clickEffect: 'standard',
  autoHide: false,
}

// ── EditorView ────────────────────────────────────────────────────────────────

export default function EditorView({ recording, onExport, onBack }) {
  const videoRef   = useRef(null)
  const wrapperRef = useRef(null)
  const tiltRef    = useRef(null)
  const videoBoxRef = useRef(null)

  const [currentTime,    setCurrentTime]    = useState(0)
  const [duration,       setDuration]       = useState(recording.duration / 1000)
  const [isPlaying,      setIsPlaying]      = useState(false)
  const [selectedEvent,  setSelectedEvent]  = useState(null)
  const [isProcessing,   setIsProcessing]   = useState(false)
  const [progress,       setProgress]       = useState(0)
  const [progressStatus, setProgressStatus] = useState('')
  const [mode,           setMode]           = useState('2d')
  const [activePanel,    setActivePanel]    = useState('zoom')
  const [canvasSettings, setCanvasSettings] = useState(DEFAULT_CANVAS)
  const [cursorSettings, setCursorSettings] = useState({
    ...DEFAULT_CURSOR,
    showCursor: recording.showCursor ?? true,
  })
  const [videoDisplaySize, setVideoDisplaySize] = useState(null)

  const [zoomEvents, setZoomEvents] = useState(() =>
    (recording.clicks || [])
      .map((c, i) => ({
        id: i,
        timestamp: c.timestamp,
        x: c.x ?? 960,
        y: c.y ?? 540,
        type: c.button === 2 ? 'zoom-out' : 'zoom-in',
        zoomLevel: 2.5,
        _resW: recording.resolution?.width  || 1920,
        _resH: recording.resolution?.height || 1080,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
  )

  usePreview(videoRef, wrapperRef, tiltRef, zoomEvents, recording.resolution, mode)

  // Track displayed video size for click effect overlay
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const ro = new ResizeObserver(() => {
      setVideoDisplaySize({ width: video.offsetWidth, height: video.offsetHeight })
    })
    ro.observe(video)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const off = window.zoomcast.onProcessProgress(({ progress: p, status }) => {
      setProgress(p); setProgressStatus(status)
    })
    return off
  }, [])

  function togglePlay() {
    const v = videoRef.current; if (!v) return
    isPlaying ? v.pause() : v.play()
    setIsPlaying(!isPlaying)
  }

  function handleSeek(t) {
    if (videoRef.current) { videoRef.current.currentTime = t; setCurrentTime(t) }
  }

  function updateEvent(id, changes) {
    setZoomEvents(p => p.map(e => e.id === id ? { ...e, ...changes } : e))
    setSelectedEvent(p => p?.id === id ? { ...p, ...changes } : p)
  }

  function deleteEvent(id) {
    setZoomEvents(p => p.filter(e => e.id !== id))
    if (selectedEvent?.id === id) setSelectedEvent(null)
  }

  function addEvent(type) {
    const res = recording.resolution
    const ev = {
      id: Date.now(),
      timestamp: Math.round(currentTime * 1000),
      x: res ? res.width / 2 : 960,
      y: res ? res.height / 2 : 540,
      type, zoomLevel: 2.5,
      _resW: res?.width  || 1920,
      _resH: res?.height || 1080,
    }
    setZoomEvents(p => [...p, ev].sort((a, b) => a.timestamp - b.timestamp))
    setSelectedEvent(ev)
  }

  async function handleExport() {
    setIsProcessing(true); setProgress(0); setProgressStatus('Starte...')
    if (mode === '3d') await handle3DExport()
    else await handle2DExport()
    setIsProcessing(false)
  }

  async function handle2DExport() {
    const result = await window.zoomcast.processVideo({
      videoPath: recording.videoPath,
      metaPath:  recording.metaPath,
      zoomEvents,
      showCursor:    cursorSettings.showCursor,
      canvasSettings,
    })
    if (result.success) onExport(result)
    else alert('Export fehlgeschlagen: ' + result.error)
  }

  async function handle3DExport() {
    try {
      setProgressStatus('Three.js 3D-Renderer startet...')
      const uint8 = await export3D({
        videoUrl:      recording.videoUrl,
        zoomEvents,
        resolution:    recording.resolution || { width: 1920, height: 1080 },
        canvasSettings,
        onProgress: (p, status) => { setProgress(p); setProgressStatus(status) },
      })
      setProgress(96); setProgressStatus('Sende an Hauptprozess...')
      const result = await window.zoomcast.process3DExport({ videoData: Array.from(uint8) })
      if (result.success) onExport(result)
      else alert('3D Export fehlgeschlagen')
    } catch (e) {
      alert('3D Export Fehler: ' + e.message)
    }
  }

  // ── Canvas style applied to video wrapper ──────────────────────────────────

  const is3D        = mode === '3d'
  const canvasStyle = getCanvasStyle(canvasSettings)

  const ASPECT_MAP = { '16:9': 16 / 9, '1:1': 1, '4:3': 4 / 3, '9:16': 9 / 16 }
  const fixedAr    = ASPECT_MAP[canvasSettings.aspectRatio] ?? null

  // ── Render ─────────────────────────────────────────────────────────────────

  const TABS = [
    { id: 'zoom',   label: 'Zoom Events' },
    { id: 'canvas', label: 'Leinwand' },
    { id: 'cursor', label: 'Cursor' },
  ]

  return (
    <div className="flex h-full">

      {/* ── Video + Controls ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Video area */}
        <div
          ref={videoBoxRef}
          className="flex-1 flex items-center justify-center relative overflow-hidden"
          style={{ background: is3D || fixedAr ? '#0a0a0a' : canvasSettings.background }}
        >
          {is3D ? (
            /* 3D mode: FocuSee-style floating screen */
            <div style={{ perspective: '900px', perspectiveOrigin: '50% 46%' }}>
              <div
                ref={tiltRef}
                style={{
                  willChange: 'transform',
                  filter: 'drop-shadow(0 40px 60px rgba(0,0,0,0.85)) drop-shadow(0 8px 20px rgba(0,0,0,0.6))',
                  transition: 'filter 0.3s ease',
                }}
              >
                <div style={{ ...canvasStyle.outer }}>
                  <div style={{ ...canvasStyle.inner }}>
                    <div ref={wrapperRef} style={{ willChange: 'transform', display: 'block' }}>
                      <video
                        ref={videoRef}
                        src={recording.videoUrl}
                        style={{ maxWidth: '75vw', maxHeight: 'calc(100vh - 220px)', display: 'block' }}
                        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                        onLoadedMetadata={e => {
                          if (isFinite(e.target.duration) && e.target.duration > 0)
                            setDuration(e.target.duration)
                        }}
                        onEnded={() => setIsPlaying(false)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : fixedAr ? (
            /* 2D mode: fixed aspect ratio canvas */
            <div style={{
              aspectRatio: String(fixedAr),
              width: `min(calc(100vw - 420px), calc((100vh - 210px) * ${fixedAr}))`,
              background: canvasStyle.outer.background,
              boxShadow: canvasStyle.outer.boxShadow,
              padding: `${canvasSettings.padding}px`,
              flexShrink: 0,
            }}>
              <div style={{
                width: '100%', height: '100%',
                borderRadius: `${canvasSettings.borderRadius}px`,
                overflow: 'hidden',
                position: 'relative',
              }}>
                <div ref={wrapperRef} style={{ willChange: 'transform', width: '100%', height: '100%' }}>
                  <video
                    ref={videoRef}
                    src={recording.videoUrl}
                    preload="auto"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                    onLoadedMetadata={e => {
                      if (isFinite(e.target.duration) && e.target.duration > 0)
                        setDuration(e.target.duration)
                    }}
                    onEnded={() => setIsPlaying(false)}
                    onError={e => {
                      const err = e.target.error
                      alert(`Video-Fehler (Code ${err?.code}): ${err?.message}`)
                    }}
                  />
                </div>
                <ClickEffectOverlay
                  videoRef={videoRef}
                  zoomEvents={zoomEvents}
                  cursorSettings={cursorSettings}
                  videoDisplaySize={videoDisplaySize}
                />
              </div>
            </div>
          ) : (
            /* 2D mode: original size, canvas wraps video */
            <div style={{ ...canvasStyle.outer, maxWidth: '100%', maxHeight: '100%' }}>
              <div style={{ ...canvasStyle.inner }}>
                <div className="overflow-hidden relative">
                  <div ref={wrapperRef} style={{ willChange: 'transform' }}>
                    <video
                      ref={videoRef}
                      src={recording.videoUrl}
                      preload="auto"
                      style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 200px)', display: 'block' }}
                      onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                      onLoadedMetadata={e => {
                        if (isFinite(e.target.duration) && e.target.duration > 0)
                          setDuration(e.target.duration)
                      }}
                      onEnded={() => setIsPlaying(false)}
                      onError={e => {
                        const err = e.target.error
                        alert(`Video-Fehler (Code ${err?.code}): ${err?.message}\n\nURL: ${recording.videoUrl}`)
                      }}
                    />
                  </div>
                  <ClickEffectOverlay
                    videoRef={videoRef}
                    zoomEvents={zoomEvents}
                    cursorSettings={cursorSettings}
                    videoDisplaySize={videoDisplaySize}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Processing overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-4">
              <p className="text-white text-sm">{progressStatus}</p>
              <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-white/40 text-xs">{progress}%</p>
              {is3D && progress < 95 && (
                <p className="text-white/25 text-xs max-w-xs text-center">3D-Export läuft in Echtzeit</p>
              )}
            </div>
          )}
        </div>

        {/* Playback bar */}
        <div className="h-10 bg-[#141414] border-t border-white/10 flex items-center px-4 gap-3 flex-shrink-0">
          <button onClick={onBack} className="text-xs text-white/30 hover:text-white/60 transition-colors">← Zurück</button>
          <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm transition-colors">
            {isPlaying ? '⏸' : '▶'}
          </button>
          <span className="text-xs text-white/40 font-mono">{fmt(currentTime)} / {fmt(duration)}</span>

          {activePanel === 'zoom' && (
            <div className="ml-auto flex gap-2">
              <button onClick={() => addEvent('zoom-in')}  className="text-xs px-3 py-1 rounded bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-violet-300 transition-colors">+ Zoom rein</button>
              <button onClick={() => addEvent('zoom-out')} className="text-xs px-3 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 transition-colors">+ Zoom raus</button>
            </div>
          )}
        </div>

        <Timeline
          duration={duration}
          currentTime={currentTime}
          zoomEvents={zoomEvents}
          selectedEvent={selectedEvent}
          onSeek={handleSeek}
          onSelectEvent={setSelectedEvent}
          onChangeEvent={updateEvent}
          videoUrl={recording.videoUrl}
        />
      </div>

      {/* ── Right panel ─────────────────────────────────────── */}
      <div className="w-96 bg-[#141414] border-l border-white/10 flex flex-col">

        {/* Tab navigation */}
        <div className="flex border-b border-white/10 flex-shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                activePanel === tab.id
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-white/35 hover:text-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 2D/3D mode toggle (always visible) */}
        <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-white/40 flex-1">Zoom-Stil</span>
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {['2d','3d'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1 text-xs font-bold transition-colors ${
                  mode === m ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'
                }`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={isProcessing}
            className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-bold transition-colors"
          >
            Export
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto">

          {activePanel === 'zoom' && (
            <div className="p-3 flex flex-col gap-2">
              <p className="text-xs text-white/30 px-1">Linksklick = rein · Rechtsklick = raus</p>
              {zoomEvents.length === 0 ? (
                <p className="text-xs text-white/25 text-center mt-8 leading-relaxed">
                  Keine Events.<br />Starte eine neue Aufnahme<br />und klicke während der Aufnahme.
                </p>
              ) : (
                zoomEvents.map(ev => (
                  <ZoomEventPanel
                    key={ev.id}
                    event={ev}
                    isSelected={selectedEvent?.id === ev.id}
                    onClick={() => { setSelectedEvent(ev); handleSeek(ev.timestamp / 1000) }}
                    onChange={changes => updateEvent(ev.id, changes)}
                    onDelete={() => deleteEvent(ev.id)}
                  />
                ))
              )}
            </div>
          )}

          {activePanel === 'canvas' && (
            <CanvasPanel settings={canvasSettings} onChange={setCanvasSettings} />
          )}

          {activePanel === 'cursor' && (
            <CursorPanel settings={cursorSettings} onChange={setCursorSettings} />
          )}
        </div>
      </div>
    </div>
  )
}

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}
