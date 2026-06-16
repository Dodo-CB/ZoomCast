import React from 'react'

export default function ExportView({ result, onNew }) {
  async function save() {
    const res = await window.zoomcast.saveExport({ sourcePath: result.outputPath })
    if (res.success) {
      alert(`Gespeichert: ${res.filePath}`)
    }
  }

  function openFolder() {
    window.zoomcast.openExportsFolder()
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="text-center">
        <div className="text-5xl mb-4">✓</div>
        <h2 className="text-2xl font-bold text-white mb-2">Export fertig!</h2>
        <p className="text-white/40 text-sm">Dein ZoomCast Video ist bereit</p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={save}
          className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold transition-colors"
        >
          Speichern als...
        </button>
        <button
          onClick={openFolder}
          className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-semibold transition-colors"
        >
          Ordner öffnen
        </button>
        <button
          onClick={onNew}
          className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-semibold transition-colors"
        >
          Neue Aufnahme
        </button>
      </div>
    </div>
  )
}
