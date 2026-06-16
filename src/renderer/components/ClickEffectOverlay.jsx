import React, { useEffect, useRef, useState } from 'react'

// Spawns animated click effects over the video preview
export default function ClickEffectOverlay({ videoRef, zoomEvents, cursorSettings, videoDisplaySize }) {
  const [particles, setParticles] = useState([])
  const lastTriggered = useRef({})

  useEffect(() => {
    const video = videoRef.current
    if (!video || cursorSettings.clickEffect === 'none') return

    function onTimeUpdate() {
      const tMs = video.currentTime * 1000
      const WINDOW = 120 // ms — trigger effect when within this window of click

      for (const ev of zoomEvents) {
        if (ev.type !== 'zoom-in') continue
        const diff = Math.abs(tMs - ev.timestamp)
        const key  = ev.id

        if (diff < WINDOW && !lastTriggered.current[key]) {
          lastTriggered.current[key] = true

          // Map video coordinates → display coordinates
          const scaleX = (videoDisplaySize?.width  || 800) / (ev._resW || 1920)
          const scaleY = (videoDisplaySize?.height || 450) / (ev._resH || 1080)
          const dispX  = ev.x * scaleX
          const dispY  = ev.y * scaleY

          spawnEffect(dispX, dispY, cursorSettings.clickEffect)
        }

        // Reset trigger when playhead moves away
        if (diff > 500) {
          delete lastTriggered.current[key]
        }
      }
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [zoomEvents, cursorSettings.clickEffect, videoDisplaySize])

  function spawnEffect(x, y, type) {
    const id = Date.now() + Math.random()
    const particle = { id, x, y, type, born: Date.now() }
    setParticles(p => [...p, particle])
    // Remove after animation completes
    setTimeout(() => {
      setParticles(p => p.filter(pp => pp.id !== id))
    }, 900)
  }

  if (particles.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <ClickParticle key={p.id} x={p.x} y={p.y} type={p.type} />
      ))}
    </div>
  )
}

function ClickParticle({ x, y, type }) {
  const style = {
    position: 'absolute',
    left: x,
    top: y,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  }

  if (type === 'standard') return (
    <div style={style}>
      <div style={{
        width: 40, height: 40,
        border: '2.5px solid rgba(255,255,255,0.9)',
        borderRadius: '50%',
        animation: 'click-standard 0.7s ease-out forwards',
      }} />
      <style>{`
        @keyframes click-standard {
          0%   { transform: scale(0); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  )

  if (type === 'ripple') return (
    <div style={style}>
      {[0, 150, 300].map(delay => (
        <div key={delay} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 40, height: 40, marginLeft: -20, marginTop: -20,
          border: '2px solid rgba(255,255,255,0.7)',
          borderRadius: '50%',
          animation: `click-ripple 0.8s ease-out ${delay}ms forwards`,
        }} />
      ))}
      <style>{`
        @keyframes click-ripple {
          0%   { transform: scale(0); opacity: 0.8; }
          100% { transform: scale(3); opacity: 0; }
        }
      `}</style>
    </div>
  )

  if (type === 'circle') return (
    <div style={style}>
      <div style={{
        width: 50, height: 50,
        border: '3px solid white',
        borderRadius: '50%',
        animation: 'click-circle 0.6s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
      }} />
      <style>{`
        @keyframes click-circle {
          0%   { transform: scale(0.2); opacity: 1; }
          60%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  )

  if (type === 'spotlight') return (
    <div style={style}>
      <div style={{
        width: 80, height: 80,
        background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'click-spotlight 0.7s ease-out forwards',
      }} />
      <style>{`
        @keyframes click-spotlight {
          0%   { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  )

  if (type === 'glitter') return (
    <div style={style}>
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * 360
        const dist  = 20 + Math.random() * 15
        return (
          <div key={i} style={{
            position: 'absolute', top: 0, left: 0,
            width: 5, height: 5,
            background: ['#ffd700','#ff69b4','#00bfff','#adff2f'][i % 4],
            borderRadius: '50%',
            animation: `glitter-${i} 0.8s ease-out forwards`,
          }} />
        )
      })}
      <style>{[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2
        const dx = Math.cos(angle) * (25 + i * 3)
        const dy = Math.sin(angle) * (25 + i * 3)
        return `@keyframes glitter-${i} { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(${dx}px,${dy}px) scale(0); opacity:0; } }`
      }).join('\n')}</style>
    </div>
  )

  if (type === 'fireworks') return (
    <div style={style}>
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2
        const dx = Math.cos(angle) * 40
        const dy = Math.sin(angle) * 40
        const color = ['#ff4757','#ffa502','#2ed573','#1e90ff','#eccc68','#ff6b81'][i % 6]
        return (
          <div key={i} style={{
            position: 'absolute', top: 0, left: 0,
            width: 6, height: 6, borderRadius: '50%',
            background: color,
            animation: `fw-${i} 0.8s cubic-bezier(0.25,0.46,0.45,0.94) forwards`,
          }} />
        )
      })}
      <style>{[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2
        const dx = Math.cos(angle) * (35 + i * 2)
        const dy = Math.sin(angle) * (35 + i * 2)
        return `@keyframes fw-${i} { 0% { transform:translate(0,0) scale(1.5); opacity:1; } 80% { opacity:1; } 100% { transform:translate(${dx}px,${dy}px) scale(0); opacity:0; } }`
      }).join('\n')}</style>
    </div>
  )

  return null
}
