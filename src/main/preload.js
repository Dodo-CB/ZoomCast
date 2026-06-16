const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('zoomcast', {
  getSources: () => ipcRenderer.invoke('get-sources'),

  startRecording: (opts) => ipcRenderer.invoke('start-recording', opts),

  // Called repeatedly to write video in 5 MB chunks (avoids huge IPC transfer)
  writeVideoChunk: (opts) => ipcRenderer.invoke('write-video-chunk', opts),

  // Called by renderer after all chunks are written
  stopRecording: () => ipcRenderer.invoke('stop-recording'),

  processVideo: (opts) => ipcRenderer.invoke('process-video', opts),
  saveExport: (opts) => ipcRenderer.invoke('save-export', opts),
  openExportsFolder: () => ipcRenderer.invoke('open-exports-folder'),

  // Main process signals F5 press → renderer must stop MediaRecorder
  onRecordingStopSignal: (cb) => {
    ipcRenderer.on('recording-stop-signal', cb)
    return () => ipcRenderer.removeAllListeners('recording-stop-signal')
  },

  process3DExport: (opts) => ipcRenderer.invoke('process-3d-export', opts),

  onProcessProgress: (cb) => {
    ipcRenderer.on('process-progress', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('process-progress')
  },
})
