const { BrowserWindow, screen, globalShortcut } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV !== 'production'
let overlayWindow = null

function show(onF5) {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.bounds

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Excluded from all screen capture on Windows 10 2004+
  overlayWindow.setContentProtection(true)

  // Click-through so user can interact with what they're recording
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173/overlay.html')
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../../dist/overlay.html'))
  }

  overlayWindow.showInactive()

  globalShortcut.register('F5', () => {
    globalShortcut.unregister('F5')
    hide()
    onF5()
  })
}

function hide() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
  try { globalShortcut.unregister('F5') } catch (_) {}
}

module.exports = { show, hide }
