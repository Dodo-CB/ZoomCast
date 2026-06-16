import React, { useEffect, useState, useRef } from 'react'

export default function RecordView({ onDone }) {
  const [sources, setSources] = useState([])
  const [selectedSource, setSelectedSource] = useState(null)
  const [showCursor, setShowCursor] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const videoPathRef = useRef(null)

  useEffect(() => {
    loadSources()
  }, [])

  // Listen for F5 stop signal from main process
  useEffect(() => {
    const off = window.zoomcast.onRecordingStopSignal(() => {
      finishRecording()
    })
    return off
  }, [])

  async function loadSources() {
    try {
      const s = await window.zoomcast.getSources()
      setSources(s)
      if (s.length > 0) setSelectedSource(s[0])
    } catch (e) {
      setError('Quellen konnten nicht geladen werden: ' + e.message)
    }
  }

  async function startRecording() {
    if (!selectedSource) return
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
            minWidth: 1280,
            maxWidth: 7680,
            minHeight: 720,
            maxHeight: 4320,
            minFrameRate: 30,
            maxFrameRate: 60,
          },
        },
      })

      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 25_000_000, // 25 Mbps — hochqualitativ
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorderRef.current = recorder
      recorder.start(100)

      // Tell main: start click tracker, hide window, show overlay
      const { videoPath } = await window.zoomcast.startRecording({
        sourceId: selectedSource.id,
        showCursor,
      })
      videoPathRef.current = videoPath

      setIsRecording(true)
    } catch (e) {
      setError('Aufnahme konnte nicht gestartet werden: ' + e.message)
    }
  }

  async function finishRecording() {
    const recorder = mediaRecorderRef.current
    const stream = streamRef.current
    if (!recorder || recorder.state === 'inactive') return

    setIsProcessing(true)
    setProcessingProgress(5)
    setError(null)

    try {
      await new Promise((resolve, reject) => {
        recorder.onerror = reject
        recorder.onstop  = resolve
        recorder.stop()
      })
      stream.getTracks().forEach(t => t.stop())
      setProcessingProgress(15)

      const blob = new Blob(chunksRef.current, { type: 'video/webm' })

      // Write in 5 MB slices — never loads the whole video into memory at once
      const CHUNK = 5 * 1024 * 1024
      const totalChunks = Math.ceil(blob.size / CHUNK) || 1
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK
        const sliceBlob = blob.slice(start, start + CHUNK)
        const buf   = await sliceBlob.arrayBuffer()
        const chunk = Array.from(new Uint8Array(buf))   // plain array → safe IPC
        await window.zoomcast.writeVideoChunk({ chunk, append: i > 0 })
        setProcessingProgress(15 + Math.round((i + 1) / totalChunks * 75))
      }

      setProcessingProgress(92)
      const result = await window.zoomcast.stopRecording()

      chunksRef.current = []   // free chunk memory — no longer needed
      setIsProcessing(false)
      setIsRecording(false)
      // result.videoUrl points to the local HTTP server (proper Range support)
      onDone({ ...result, showCursor })

    } catch (err) {
      // Show error on screen instead of crashing the renderer
      setError('Aufnahme konnte nicht gespeichert werden: ' + (err?.message ?? String(err)))
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex h-full relative">
      {/* Processing overlay */}
      {isProcessing && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-5">
          <div className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
          <div className="text-center">
            <p className="text-white font-semibold mb-3">Video wird gespeichert...</p>
            <div className="w-56 bg-white/10 rounded-full h-1.5">
              <div
                className="bg-violet-500 h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <p className="text-white/35 text-xs mt-2">{processingProgress}%</p>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <div className="w-72 bg-[#141414] border-r border-white/10 flex flex-col p-5 gap-5">
        <h1 className="text-xl font-bold text-white">ZoomCast</h1>

        {/* Source selection */}
        <div>
          <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Bildschirm / Fenster</p>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {sources.map(src => (
              <button
                key={src.id}
                onClick={() => setSelectedSource(src)}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-all text-left ${
                  selectedSource?.id === src.id
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <img src={src.thumbnail} className="w-16 h-9 rounded object-cover bg-black flex-shrink-0" />
                <span className="text-sm text-white/80 truncate">{src.name}</span>
              </button>
            ))}
          </div>
          <button
            onClick={loadSources}
            className="mt-2 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Aktualisieren
          </button>
        </div>

        {/* Options */}
        <div>
          <p className="text-xs text-white/50 uppercase tracking-wider mb-3">Optionen</p>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setShowCursor(!showCursor)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${showCursor ? 'bg-violet-500' : 'bg-white/20'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showCursor ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-white/70">Cursor aufnehmen</span>
          </label>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2">
          {!isRecording ? (
            <>
              <button
                onClick={startRecording}
                disabled={!selectedSource}
                className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-white transition-colors"
              >
                Aufnahme starten
              </button>
              <p className="text-xs text-white/20 text-center">
                Fenster wird nach dem Start ausgeblendet
              </p>
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-xs text-white/30">Aufnahme läuft im Hintergrund</p>
              <p className="text-xs text-violet-400 mt-1">F5 zum Stoppen</p>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
        {selectedSource ? (
          <div className="text-center">
            <img
              src={selectedSource.thumbnail}
              className="max-w-2xl max-h-96 rounded-xl border border-white/10 shadow-2xl"
            />
            <p className="mt-3 text-sm text-white/40">{selectedSource.name}</p>
          </div>
        ) : (
          <p className="text-white/20 text-sm">Keine Quelle ausgewählt</p>
        )}
      </div>
    </div>
  )
}
