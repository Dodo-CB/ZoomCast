const net = require('net')
const { spawn } = require('child_process')
const path = require('path')

function waitForPort(port, host, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    function attempt() {
      const sock = new net.Socket()
      sock.setTimeout(1000)
      sock.on('connect', () => { sock.destroy(); resolve() })
      sock.on('error', () => {
        sock.destroy()
        if (Date.now() >= deadline) return reject(new Error('Timeout'))
        setTimeout(attempt, 500)
      })
      sock.on('timeout', () => { sock.destroy(); setTimeout(attempt, 500) })
      sock.connect(port, host)
    }
    attempt()
  })
}

console.log('[electron-starter] Warte auf Vite...')

waitForPort(5173, '127.0.0.1').then(() => {
  console.log('[electron-starter] Vite bereit, starte Electron...')
  const electronPath = require('electron')
  const proc = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'development' },
    shell: false,
  })
  proc.on('close', (code) => process.exit(code ?? 0))
}).catch((err) => {
  console.error('[electron-starter] Fehler:', err.message)
  process.exit(1)
})
