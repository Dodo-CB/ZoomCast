import React from 'react'

const ASPECT_RATIOS = [
  { label: 'Original', value: 'original' },
  { label: '16:9',     value: '16:9' },
  { label: '1:1',      value: '1:1' },
  { label: '4:3',      value: '4:3' },
  { label: '9:16',     value: '9:16' },
]

const GRADIENT_PRESETS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#2980b9,#6dd5fa)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#ff9a9e,#fecfef)',
  'linear-gradient(135deg,#ffecd2,#fcb69f)',
  'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
  'linear-gradient(135deg,#d4fc79,#96e6a1)',
  'linear-gradient(135deg,#30cfd0,#330867)',
  'linear-gradient(135deg,#0f0c29,#302b63,#24243e)',
  'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)',
  'linear-gradient(180deg,#232526,#414345)',
  'linear-gradient(135deg,#0a0a0a,#1a1a1a)',
]

const SOLID_COLORS = [
  '#8b5cf6','#3b82f6','#06b6d4','#10b981',
  '#84cc16','#eab308','#f97316','#ef4444',
  '#ec4899','#a855f7','#6366f1','#14b8a6',
  '#f8fafc','#94a3b8','#334155','#0f172a',
]

export default function CanvasPanel({ settings, onChange }) {
  const set = (key, val) => onChange({ ...settings, [key]: val })

  return (
    <div className="flex flex-col gap-5 p-4">

      {/* Aspect ratio */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Leinwandgröße</p>
        <div className="flex flex-wrap gap-1.5">
          {ASPECT_RATIOS.map(r => (
            <button
              key={r.value}
              onClick={() => set('aspectRatio', r.value)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                settings.aspectRatio === r.value
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <SliderRow label="Abstand"   value={settings.padding}      min={0} max={300} onChange={v => set('padding', v)} />
      <SliderRow label="Abrundung" value={settings.borderRadius} min={0} max={80}  onChange={v => set('borderRadius', v)} />
      <SliderRow label="Schatten"  value={settings.shadow}       min={0} max={150} onChange={v => set('shadow', v)} />

      {/* Background */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-wider mb-3">Hintergrund</p>

        {/* Gradient presets */}
        <div className="grid grid-cols-5 gap-2 mb-3">
          {GRADIENT_PRESETS.map((g, i) => (
            <button
              key={i}
              onClick={() => set('background', g)}
              title={`Gradient ${i + 1}`}
              style={{ background: g }}
              className={`h-11 rounded-lg border-2 transition-all ${
                settings.background === g ? 'border-white scale-105' : 'border-transparent hover:border-white/40'
              }`}
            />
          ))}
        </div>

        {/* Solid colors */}
        <div className="grid grid-cols-8 gap-2">
          {SOLID_COLORS.map(c => (
            <button
              key={c}
              onClick={() => set('background', c)}
              style={{ background: c }}
              className={`h-8 w-8 rounded-lg border-2 transition-all ${
                settings.background === c ? 'border-white scale-110' : 'border-transparent hover:border-white/40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SliderRow({ label, value, min, max, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-white/60">{label}</span>
        <span className="text-white/40 font-mono">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  )
}
