import React from 'react'

const CLICK_EFFECTS = [
  { id: 'none',      label: 'Keine',     icon: '⊘' },
  { id: 'standard',  label: 'Standard',  icon: '↖' },
  { id: 'ripple',    label: 'Welligkeit',icon: '◎' },
  { id: 'circle',    label: 'Kreis',     icon: '○' },
  { id: 'spotlight', label: 'Spotlight', icon: '◉' },
  { id: 'glitter',   label: 'Glitzer',   icon: '✦' },
  { id: 'fireworks', label: 'Feuerwerk', icon: '✸' },
]

export default function CursorPanel({ settings, onChange }) {
  const set = (key, val) => onChange({ ...settings, [key]: val })

  return (
    <div className="flex flex-col gap-5 p-4">

      {/* Show cursor */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/70">Maus anzeigen</span>
        <Toggle value={settings.showCursor} onChange={v => set('showCursor', v)} />
      </div>

      {/* Cursor size */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-white/60">Cursor-Größe</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => set('cursorSize', 3.0)}
              className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
            >
              Zurücksetzen
            </button>
            <span className="text-white/40 font-mono">{settings.cursorSize.toFixed(1)}x</span>
          </div>
        </div>
        <input
          type="range" min={0.5} max={5} step={0.1}
          value={settings.cursorSize}
          onChange={e => set('cursorSize', parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      {/* Click effects */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-wider mb-3">Cursorklick-Effekt</p>
        <div className="grid grid-cols-3 gap-2">
          {CLICK_EFFECTS.map(eff => (
            <button
              key={eff.id}
              onClick={() => set('clickEffect', eff.id)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                settings.clickEffect === eff.id
                  ? 'border-blue-500 bg-blue-600/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/70'
              }`}
            >
              <span className="text-xl leading-none">{eff.icon}</span>
              <span className="text-xs font-medium leading-tight text-center">{eff.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Auto hide */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-white/70">Automatisch ausblenden</span>
          <p className="text-xs text-white/30 mt-0.5">Cursor nach 2s Inaktivität</p>
        </div>
        <Toggle value={settings.autoHide} onChange={v => set('autoHide', v)} />
      </div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full cursor-pointer relative transition-colors ${value ? 'bg-blue-500' : 'bg-white/20'}`}
    >
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </div>
  )
}
