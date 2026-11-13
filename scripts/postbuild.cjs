/**
 * scripts/postbuild.cjs
 * Cross-platform post-build script (replaces PowerShell Copy-Item commands).
 * Copies .next/static and public/ into .next/standalone for deployment.
 */
const fs = require('fs')
const path = require('path')

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[postbuild] Skipping (not found): ${src}`)
    return
  }
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

const root = path.resolve(__dirname, '..')
const standalone = path.join(root, '.next', 'standalone')

if (process.env.VERCEL) {
  console.log('[postbuild] Running on Vercel, skipping standalone directory copy.')
  process.exit(0)
}

console.log('[postbuild] Copying .next/static → .next/standalone/.next/static ...')
copyDirSync(
  path.join(root, '.next', 'static'),
  path.join(standalone, '.next', 'static')
)

console.log('[postbuild] Copying public/ → .next/standalone/public ...')
copyDirSync(
  path.join(root, 'public'),
  path.join(standalone, 'public')
)

console.log('[postbuild] Done.')
