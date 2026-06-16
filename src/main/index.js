const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, shell, protocol } = require('electron')
const path   = require('path')
const fs     = require('fs')
const http   = require('http')
const recorder    = require('./recorder')
const clickTracker = require('./clickTracker')
const overlay     = require('./overlay')
const processor   = require('../processor/processor')

const isDev = process.env.NODE_ENV !== 'production'

let mainWindow
let splashWindow
let splashStartTime = 0

// ── Splash ────────────────────────────────────────────────────────────────────

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 450,
    frame: false,
    resizable: false,
    center: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0c0c14',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  splashWindow.once('ready-to-show', () => {
    splashStartTime = Date.now()
    splashWindow.show()
  })
}

async function setSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return
  await splashWindow.webContents
    .executeJavaScript(`(el => el && (el.textContent = ${JSON.stringify(text)}))(document.getElementById('status'))`)
    .catch(() => {})
}

// ── Local video HTTP server (proper Range-request support for <video>) ────────

let videoServer     = null
let videoServerPort = 0
let currentVideoPath = null

function startVideoServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (!currentVideoPath || !fs.existsSync(currentVideoPath)) {
        res.writeHead(404); res.end('not found'); return
      }
      const stat     = fs.statSync(currentVideoPath)
      const fileSize = stat.size
      const range    = req.headers.range

      if (range) {
        const [, s, e] = range.replace('bytes=', '').match(/(\d+)-(\d*)/)
        const start = parseInt(s, 10)
        const end   = e ? parseInt(e, 10) : fileSize - 1
        res.writeHead(206, {
          'Content-Type':  'video/webm',
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': end - start + 1,
          'Accept-Ranges': 'bytes',
        })
        fs.createReadStream(currentVideoPath, { start, end }).pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Type':   'video/webm',
          'Content-Length': fileSize,
          'Accept-Ranges':  'bytes',
        })
        fs.createReadStream(currentVideoPath).pipe(res)
      }
    })
    server.listen(0, '127.0.0.1', () => {
      videoServerPort = server.address().port
      videoServer = server
      resolve()
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f0f0f',
      symbolColor: '#ffffff',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.once('ready-to-show', async () => {
    await setSplashStatus('Bereit!')
    const elapsed = Date.now() - splashStartTime
    const remaining = Math.max(0, 10000 - elapsed)
    await new Promise(r => setTimeout(r, remaining))
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    mainWindow.show()
    mainWindow.focus()
  })
}

app.whenReady().then(async () => {
  createSplash()

  await setSplashStatus('Video-Server wird gestartet...')
  await startVideoServer()

  await setSplashStatus('Anwendung wird geladen...')
  createWindow()
})

app.on('window-all-closed', () => {
  overlay.hide()
  clickTracker.stop()
  app.quit()
})

// ── IPC: Screen Sources ──────────────────────────────────────────────────────

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  })
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  }))
})

// ── IPC: Recording Start ─────────────────────────────────────────────────────

ipcMain.handle('start-recording', async (_, { sourceId, showCursor }) => {
  const tempDir = path.join(app.getPath('userData'), 'temp')
  fs.mkdirSync(tempDir, { recursive: true })
  const videoPath = path.join(tempDir, `recording_${Date.now()}.webm`)

  clickTracker.start()
  await recorder.start(videoPath, sourceId, showCursor)

  // Hide main window, show overlay
  mainWindow.hide()
  overlay.show(() => {
    // F5 pressed — show window immediately so user doesn't see black screen
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('recording-stop-signal')
  })

  return { videoPath }
})

// ── IPC: Video chunk write (called repeatedly from renderer while processing) ─

ipcMain.handle('write-video-chunk', (_, { chunk, append }) => {
  try {
    const state = recorder.getState()
    if (!state) throw new Error('Kein aktiver Recorder-State')
    const buf = Buffer.from(chunk)
    if (append) {
      fs.appendFileSync(state.outputPath, buf)
    } else {
      fs.writeFileSync(state.outputPath, buf)
    }
  } catch (err) {
    console.error('[write-video-chunk] Fehler:', err.message)
    throw err  // propagate to renderer so it shows the error
  }
})

// ── IPC: Recording Stop (called by renderer after all chunks written) ─────────

ipcMain.handle('stop-recording', async () => {
  const clicks = clickTracker.stop()
  const result = await recorder.stop()

  const metaPath = result.videoPath.replace('.webm', '_clicks.json')
  fs.writeFileSync(metaPath, JSON.stringify({
    recordingStart: result.recordingStart,
    resolution: result.resolution,
    duration: result.duration,
    clicks,
  }, null, 2))

  // Point the local HTTP server at the new video file
  currentVideoPath = result.videoPath
  const videoUrl = `http://127.0.0.1:${videoServerPort}/video`

  return {
    videoPath: result.videoPath,
    videoUrl,
    metaPath,
    clicks,
    duration: result.duration,
    resolution: result.resolution,
  }
})

// ── IPC: Processing ──────────────────────────────────────────────────────────

ipcMain.handle('process-video', async (_, { videoPath, metaPath, zoomEvents, showCursor }) => {
  const exportsDir = path.join(app.getPath('userData'), 'exports')
  fs.mkdirSync(exportsDir, { recursive: true })
  const outputPath = path.join(exportsDir, `zoomcast_${Date.now()}.mp4`)

  mainWindow.webContents.send('process-progress', { progress: 0, status: 'Starte Verarbeitung...' })

  try {
    await processor.process({
      videoPath,
      metaPath,
      zoomEvents,
      showCursor,
      outputPath,
      onProgress: (p, status) => {
        mainWindow.webContents.send('process-progress', { progress: p, status })
      },
    })
    return { success: true, outputPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ── IPC: Export / Save ───────────────────────────────────────────────────────

ipcMain.handle('save-export', async (_, { sourcePath }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `ZoomCast_${Date.now()}.mp4`,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  })
  if (!filePath) return { cancelled: true }
  fs.copyFileSync(sourcePath, filePath)
  return { success: true, filePath }
})

ipcMain.handle('open-exports-folder', () => {
  shell.openPath(path.join(app.getPath('userData'), 'exports'))
})

// ── IPC: 3D Export (renderer sends rendered webm, main converts to mp4) ──────

ipcMain.handle('process-3d-export', async (_, { videoData }) => {
  const tempDir    = path.join(app.getPath('userData'), 'temp')
  const exportsDir = path.join(app.getPath('userData'), 'exports')
  fs.mkdirSync(tempDir,    { recursive: true })
  fs.mkdirSync(exportsDir, { recursive: true })

  const tempWebm  = path.join(tempDir,    `3d_render_${Date.now()}.webm`)
  const outputMp4 = path.join(exportsDir, `zoomcast_3d_${Date.now()}.mp4`)

  fs.writeFileSync(tempWebm, Buffer.from(videoData))

  mainWindow.webContents.send('process-progress', { progress: 97, status: 'Konvertiere zu MP4...' })

  await convertToMp4(tempWebm, outputMp4)

  try { fs.unlinkSync(tempWebm) } catch (_) {}

  mainWindow.webContents.send('process-progress', { progress: 100, status: 'Fertig!' })
  return { success: true, outputPath: outputMp4 }
})

function convertToMp4(inputPath, outputPath) {
  const ffmpegPath = require('ffmpeg-static')
  const { spawn }  = require('child_process')
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, [
      '-y', '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '17',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    ])
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg code ${code}`)))
    ff.on('error', reject)
  })
}
