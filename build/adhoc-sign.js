// Ad-hoc handtekening voor de Mac-app (zonder Apple-certificaat). Zo klopt de handtekening
// van het hele pakket en meldt macOS na installatie niet dat de app "beschadigd" is.
// Alleen op de uiteindelijke universal-app: de losse x64/arm64-builds moeten gelijk blijven
// om samengevoegd te kunnen worden.
const { execFileSync } = require('child_process')
const path = require('path')

const UNIVERSAL = 4 // builder-util Arch.universal

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || context.arch !== UNIVERSAL) return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`[adhoc-sign] ${app}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}
