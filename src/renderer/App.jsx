import React, { useState } from 'react'
import RecordView from './views/RecordView'
import EditorView from './views/EditorView'
import ExportView from './views/ExportView'

export default function App() {
  const [view, setView] = useState('record') // 'record' | 'editor' | 'export'
  const [recordingResult, setRecordingResult] = useState(null)
  const [exportResult, setExportResult] = useState(null)

  function handleRecordingDone(result) {
    setRecordingResult(result)
    setView('editor')
  }

  function handleExportDone(result) {
    setExportResult(result)
    setView('export')
  }

  function handleNewRecording() {
    setRecordingResult(null)
    setExportResult(null)
    setView('record')
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f] text-white">
      {/* Titlebar drag area */}
      <div className="h-8 w-full" style={{ WebkitAppRegion: 'drag' }} />

      <div className="flex-1 overflow-hidden">
        {view === 'record' && (
          <RecordView onDone={handleRecordingDone} />
        )}
        {view === 'editor' && recordingResult && (
          <EditorView
            recording={recordingResult}
            onExport={handleExportDone}
            onBack={() => setView('record')}
          />
        )}
        {view === 'export' && exportResult && (
          <ExportView
            result={exportResult}
            onNew={handleNewRecording}
          />
        )}
      </div>
    </div>
  )
}
