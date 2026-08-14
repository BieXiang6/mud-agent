import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePlatform, resetPlatform } from '../utils/platform/index.js'

const storage = new Map()
let appliedStyle = null

configurePlatform({
  name: 'appearance-test',
  openSocket() {},
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) },
  resolveAssetUrl(source) { return 'asset:' + source },
  applyAppStyle(style) { appliedStyle = style },
  setBackgroundColor() {},
  setNavigationBarColor() {},
  getRuntimeCapabilities() { return { platform: 'test', supportsSvgBackground: true } }
})

const appearance = await import('../utils/appearance.js')

test('persists semantic appearance tokens and resolves image backgrounds', () => {
  appearance.resetAppAppearance('both')
  assert.equal(appearance.appStyle['--app-ai-summary-background-color'], '#151c18')
  assert.equal(appearance.appStyle['--app-ai-summary-radius'], '0rpx')
  assert.equal(appearance.appStyle['--app-quick-entry-background-color'], 'rgba(38, 47, 54, 0.94)')
  assert.equal(appearance.appStyle['--app-quick-entry-radius'], '50%')
  appearance.updateAppAppearance('dark', {
    colors: { primary: '#123456', text: 'rgb(240, 241, 242)' },
    shape: { radiusMedium: 14 },
    background: {
      type: 'image', source: 'static/theme.webp', fallbackColor: '#050607',
      size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'fixed', overlay: 'rgba(0, 0, 0, 0.35)'
    },
    backgrounds: {
      primaryButton: { type: 'image', source: 'static/button.png', fallbackColor: '#123456', size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'scroll', overlay: 'transparent' }
    }
  })

  const current = appearance.getAppAppearance('dark')
  assert.equal(current.config.colors.primary, '#123456')
  assert.equal(current.config.shape.radiusMedium, 14)
  assert.match(appearance.appStyle.backgroundImage, /asset:static\/theme\.webp/)
  assert.match(appearance.appStyle['--app-primary-button-background-image'], /asset:static\/button\.png/)
  assert.equal(appearance.appStyle['--app-quick-entry-background-color'], 'var(--app-primary-button-background-color)')
  assert.equal(appearance.appStyle['--app-quick-entry-radius'], 'var(--app-radius-large)')
  assert.equal(appearance.appStyle['--app-ai-summary-background-color'], 'var(--app-panel-background-color)')
  assert.equal(appearance.appStyle['--app-ai-summary-radius'], 'var(--app-radius-medium)')
  assert.equal(appliedStyle['--app-primary'], '#123456')
  assert.equal(appliedStyle.colorScheme, 'dark')
  assert.match(appliedStyle['--app-primary-soft'], /^rgba\(18, 52, 86, 0\.15\)$/)
  assert.ok(storage.get('mud_app_appearance_v1'))

  const exported = appearance.exportAppAppearanceText()
  const file = JSON.parse(exported)
  assert.equal(file.format, 'mud-agent-appearance')
  assert.equal(file.version, 1)
  appearance.resetAppAppearance('both')
  assert.notEqual(appearance.getAppAppearance('dark').config.colors.primary, '#123456')
  assert.deepEqual(appearance.importAppAppearanceText(exported).modes, ['dark', 'light'])
  assert.equal(appearance.getAppAppearance('dark').config.colors.primary, '#123456')
  assert.throws(() => appearance.importAppAppearanceText('{"format":"wrong","version":1}'), /不是受支持/)

  appearance.updateAppAppearance('dark', { background: { fallbackColor: '#050607' }, colors: { background: '#101112' } })
  appearance.resetAppAppearance('dark', ['background'])
  assert.equal(appearance.appStyle.backgroundColor, '#101112')
})

test('supports safe raw SVG backgrounds and rejects executable SVG', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop stop-color="#123456"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>'
  appearance.updateAppAppearance('light', {
    background: { type: 'svg', source: svg, fallbackColor: '#eeeeee', size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'scroll', overlay: 'transparent' },
    backgrounds: {
      dialog: { type: 'svg', source: svg, fallbackColor: '#ffffff', size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'scroll', overlay: 'rgba(255, 255, 255, 0.1)' },
      aiSummary: { type: 'svg', source: svg, fallbackColor: '#eef4ee', size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'scroll', overlay: 'transparent' },
      quickEntry: { type: 'svg', source: svg, fallbackColor: '#3f706b', size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'scroll', overlay: 'transparent' }
    }
  })
  appearance.applyAppAppearance('light')
  assert.equal(appearance.appStyle.colorScheme, 'light')
  assert.equal(appearance.appStyle['--app-background'], '#eeeeee')
  assert.match(appearance.appStyle.backgroundImage, /^url\("data:image\/svg\+xml/)
  assert.match(appearance.appStyle['--app-dialog-background-image'], /^linear-gradient.*data:image\/svg\+xml/)
  assert.equal(appearance.appStyle['--app-ai-summary-background-image'], 'var(--app-ai-summary-slot-background-image)')
  assert.equal(appearance.appStyle['--app-quick-entry-background-image'], 'var(--app-quick-entry-slot-background-image)')
  assert.throws(() => appearance.updateAppAppearance('light', {
    background: { type: 'svg', source: '<svg onload="alert(1)"></svg>' }
  }), /包含脚本、事件或外部资源/)
  appearance.resetAppAppearance('both')
})

test('supports independent block backgrounds without changing general panel inheritance', () => {
  appearance.resetAppAppearance('both')
  assert.equal(appearance.appStyle['--app-chat-background-color'], undefined)

  appearance.updateAppAppearance('dark', {
    backgrounds: {
      panel: { fallbackColor: '#202428' },
      chat: { type: 'image', source: 'static/chat.webp', fallbackColor: '#111820', overlay: 'rgba(0, 0, 0, 0.2)' }
    }
  })
  appearance.applyAppAppearance('dark')

  assert.equal(appearance.appStyle['--app-panel-background-color'], '#202428')
  assert.equal(appearance.appStyle['--app-chat-background-color'], '#111820')
  assert.match(appearance.appStyle['--app-chat-background-image'], /asset:static\/chat\.webp/)
  assert.equal(appearance.appStyle['--app-ai-panel-background-color'], undefined)

  appearance.resetAppAppearance('dark', [], ['chat'])
  assert.equal(appearance.appStyle['--app-chat-background-color'], undefined)
  assert.equal(appearance.appStyle['--app-panel-background-color'], '#202428')
  assert.equal(appearance.getAppAppearance('dark').overrides.backgrounds.chat, undefined)
  appearance.resetAppAppearance('both')
  resetPlatform()
})
