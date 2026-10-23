import path from 'node:path'
import { loadEnvFiles } from '../server/env.js'
import { createMarketplaceStore } from '../server/marketplaceStore.js'
loadEnvFiles()
const [command, value] = process.argv.slice(2)
if (!['block', 'unblock', 'block-account', 'unblock-account'].includes(command) || !value) {
  console.error('用法: npm run market:admin -- <block|unblock> <昵称>，或 <block-account|unblock-account> <游戏账号>')
  process.exitCode = 1
} else {
  try {
    const store = createMarketplaceStore({ dataDir: process.env.MARKET_DATA_DIR || path.resolve('server/data/market') })
    const result = command.endsWith('-account')
      ? await store.setAccountBlocked(value, command === 'block-account')
      : await store.setBlocked(value, command === 'block')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
