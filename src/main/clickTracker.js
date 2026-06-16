let uiohook
try {
  uiohook = require('uiohook-napi')
} catch (e) {
  console.warn('uiohook-napi nicht verfügbar:', e.message)
}

let clicks = []
let startTime = null
let active = false

function start() {
  clicks = []
  startTime = Date.now()
  active = true

  if (!uiohook) return

  uiohook.uIOhook.on('click', (e) => {
    if (!active) return
    clicks.push({
      timestamp: Date.now() - startTime,
      x: e.x,
      y: e.y,
      button: e.button,
    })
  })

  uiohook.uIOhook.start()
}

function stop() {
  active = false
  if (uiohook) {
    try {
      uiohook.uIOhook.stop()
      uiohook.uIOhook.removeAllListeners('click')
    } catch (e) {}
  }
  const result = [...clicks]
  clicks = []
  startTime = null
  return result
}

module.exports = { start, stop }
