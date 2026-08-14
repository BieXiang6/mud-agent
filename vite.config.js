import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'

const uni = typeof uniModule === 'function' ? uniModule : uniModule.default
const isAppPlus = process.env.UNI_PLATFORM === 'app' || process.env.UNI_PLATFORM === 'app-plus'

export default defineConfig({
  base: './',
  plugins: [uni()],
  build: {
    sourcemap: false,
    target: isAppPlus ? 'es2019' : 'chrome120'
  }
})
