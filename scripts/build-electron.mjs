import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvFiles } from '../server/env.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnvFiles(root)
const stage = path.join(root, 'dist', 'electron-app')
const renderer = path.join(stage, 'renderer')
const releaseDir = path.join(root, 'release', 'electron')
const mode = process.argv.includes('--dir') ? 'dir' : process.argv.includes('--run') ? 'run' : 'pack'

function formatDuration(startedAt) {
  return ((Date.now() - startedAt) / 1000).toFixed(1) + 's'
}

function run(command, args, { env = process.env, label = path.basename(command) } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    console.log(`[electron-build] 开始：${label}`)
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`[electron-build] 完成：${label}（${formatDuration(startedAt)}）`)
        resolve()
      } else {
        reject(new Error(`${label}失败，退出码: ${code}`))
      }
    })
  })
}

async function main() {
  const startedAt = Date.now()
  console.log(`[electron-build] 模式：${mode}`)
  console.log('[electron-build] 清理临时目录')
  await rm(stage, { recursive: true, force: true })
  await rm(releaseDir, { recursive: true, force: true })
  await mkdir(renderer, { recursive: true })

  const uniCli = path.join(root, 'node_modules', '@dcloudio', 'vite-plugin-uni', 'bin', 'uni.js')
  await run(process.execPath, [uniCli, 'build', '-p', 'h5'], {
    label: '编译 uni-app renderer',
    env: {
      ...process.env,
      UNI_INPUT_DIR: root,
      UNI_OUTPUT_DIR: renderer,
      NODE_ENV: 'production'
    }
  })

  console.log('[electron-build] 准备 Electron 暂存目录')
  await cp(path.join(root, 'electron', 'main.cjs'), path.join(stage, 'main.cjs'))
  await cp(path.join(root, 'electron', 'preload.cjs'), path.join(stage, 'preload.cjs'))
  await cp(path.join(root, 'static', 'icons', '1024x1024.png'), path.join(stage, 'icon.png'))
  const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const manifestText = await readFile(path.join(root, 'manifest.json'), 'utf8')
  const desktopVersion = manifestText.match(/"versionName"\s*:\s*"([^"]+)"/u)?.[1] || rootPackage.version
  await writeFile(path.join(stage, 'package.json'), JSON.stringify({
    name: 'mud-agent-desktop',
    version: desktopVersion,
    description: '这是江湖 MUD 客户端与 AI 智能体桌面版',
    author: 'Mud Agent',
    private: true,
    main: 'main.cjs'
  }, null, 2) + '\n')
  await writeFile(path.join(stage, 'package-lock.json'), JSON.stringify({
    name: 'mud-agent-desktop',
    version: desktopVersion,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'mud-agent-desktop', version: desktopVersion }
    }
  }, null, 2) + '\n')

  const electronBin = path.join(root, 'node_modules', 'electron', 'cli.js')
  if (mode === 'run') {
    await run(process.execPath, [electronBin, stage], { label: '运行 Electron（关闭窗口后命令结束）' })
    return
  }
  const builderBin = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
  const args = [builderBin, '--projectDir', stage, '--config', path.join(root, 'electron-builder.config.cjs')]
  if (mode === 'dir') args.push('--dir')
  const builderEnv = {
    ...process.env
  }
  await run(process.execPath, args, {
    label: mode === 'dir' ? '生成免安装目录' : '生成 Windows 安装程序',
    env: builderEnv
  })
  console.log(`[electron-build] 全部完成（${formatDuration(startedAt)}），输出：${releaseDir}`)
}

main().catch((error) => {
  console.error('[electron-build]', error && error.stack || error)
  process.exitCode = 1
})
