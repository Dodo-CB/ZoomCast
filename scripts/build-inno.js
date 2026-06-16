const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ISCC_PATHS = [
  'C:\\Users\\dodoh\\AppData\\Local\\Programs\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
]

const iscc = ISCC_PATHS.find(p => fs.existsSync(p))
if (!iscc) {
  console.error('\n❌ Inno Setup 6 nicht gefunden!')
  console.error('   Bitte installieren: https://jrsoftware.org/isdl.php')
  process.exit(1)
}

const unpacked = path.join(__dirname, '..', 'release', 'win-unpacked')
if (!fs.existsSync(unpacked)) {
  console.error('\n❌ release\\win-unpacked nicht gefunden — erst "npm run build:pack" ausführen')
  process.exit(1)
}

console.log('\n🔨 Erstelle Installer mit Inno Setup...')
execFileSync(iscc, ['installer.iss'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
})
console.log('\n✅ Installer erstellt: release\\ZoomCast-Setup-1.0.0.exe')
