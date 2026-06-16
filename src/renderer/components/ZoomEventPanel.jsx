import React from 'react'

function fmt(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const frac = Math.floor((ms % 1000) / 100)
  return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}.${frac}`
}

export default function ZoomEventPanel({ event, isSelected, onClick, onChange, onDelete }) {
  const isOut = event.type === 'zoom-out'

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-3 cursor-pointer transition-all ${
        isSelected
          ? isOut
            ? 'border-white/30 bg-white/10'
            : 'border-violet-500 bg-violet-500/10'
          : 'border-white/10 hover:border-white/20 bg-white/5'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${isOut ? 'text-white/40' : 'text-violet-400'}`}>
            {isOut ? '↙ Zoom raus' : '↗ Zoom rein'}
          </span>
          <span className="text-xs font-mono text-white/30">{fmt(event.timestamp)}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="text-white/20 hover:text-red-400 transition-colors text-xs"
        >✕</button>
      </div>

      {/* Expanded controls (only for zoom-in) */}
      {isSelected && !isOut && (
        <div className="flex flex-col gap-2 mt-3" onClick={e => e.stopPropagation()}>
          <div>
            <div className="flex justify-between text-xs text-white/40 mb-1">
              <span>Zoom Level</span>
              <span>{(event.zoomLevel ?? 2.5).toFixed(1)}x</span>
            </div>
            <input
              type="range" min="1.3" max="5" step="0.1"
              value={event.zoomLevel ?? 2.5}
              onChange={e => onChange({ zoomLevel: parseFloat(e.target.value) })}
              className="w-full accent-violet-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-white/40">X</span>
              <input
                type="number" value={event.x ?? 960}
                onChange={e => onChange({ x: parseInt(e.target.value) })}
                className="w-full mt-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white"
              />
            </div>
            <div>
              <span className="text-xs text-white/40">Y</span>
              <input
                type="number" value={event.y ?? 540}
                onChange={e => onChange({ y: parseInt(e.target.value) })}
                className="w-full mt-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          </div>
        </div>
      )}

      {!isSelected && !isOut && (
        <div className="text-xs text-white/30">
          {(event.zoomLevel ?? 2.5).toFixed(1)}x · ({event.x}, {event.y})
        </div>
      )}
    </div>
  )
}
