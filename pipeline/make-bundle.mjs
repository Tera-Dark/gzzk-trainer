// 把 app/dist 打成原生热更新包，并写好 bundle.json
//
// 用法：node pipeline/make-bundle.mjs 1.0.1 "修了什么"
// 产物：release/gzzk-bundle-1.0.1.zip（上传到 GitHub Release）
//       bundle.json（已填好 version / url / notes，提交后 jsDelivr 生效）

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'app', 'dist')
const OUT = path.join(ROOT, 'release')

const version = process.argv[2]
const notes = process.argv[3] ?? ''
if (!version) {
  console.error('用法: node pipeline/make-bundle.mjs <版本号> [更新说明]')
  process.exit(1)
}
if (!fs.existsSync(DIST)) {
  console.error('找不到 app/dist，请先 cd app && npm run build')
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })
const zipName = `gzzk-bundle-${version}.zip`
const zipPath = path.join(OUT, zipName)
if (fs.existsSync(zipPath)) fs.rmSync(zipPath)

// Windows 用系统自带 tar（支持 zip 里的目录结构，且不需要额外依赖）
if (process.platform === 'win32') {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${DIST}\\*' -DestinationPath '${zipPath}' -Force`,
  ], { stdio: 'inherit' })
} else {
  execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: DIST, stdio: 'inherit' })
}

const url = `https://github.com/Tera-Dark/gzzk-trainer/releases/download/v${version}/${zipName}`
const feed = { version, url, notes }
const feedJson = JSON.stringify(feed, null, 2) + '\n'
// 根目录这份是仓库里的记录；app/public 那份会跟着站点发布到 GitHub Pages，
// App 端优先从这个地址读（jsDelivr 的 @main 缓存太久，不可靠）。
fs.writeFileSync(path.join(ROOT, 'bundle.json'), feedJson)
fs.writeFileSync(path.join(ROOT, 'app', 'public', 'bundle.json'), feedJson)

console.log(`\n热更新包: ${zipPath}  (${(fs.statSync(zipPath).size / 1048576).toFixed(1)} MB)`)
console.log('下一步：')
console.log(`  1) gh release create v${version} "${zipPath}" --title "v${version}" --notes "${notes || '更新'}"`)
console.log('  2) git add bundle.json app/public/bundle.json app/src/lib/content.ts')
console.log('     && git commit -m "发布 v' + version + '" && git push')
console.log('  3) 等 Pages 部署完（gh run watch），App 端 10 分钟内就能查到')
