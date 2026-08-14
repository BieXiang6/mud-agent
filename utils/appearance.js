import { reactive } from 'vue'
import { runtime } from './platform/index.js'

const APPEARANCE_STORAGE_KEY = 'mud_app_appearance_v1'
const APPEARANCE_FILE_FORMAT = 'mud-agent-appearance'
const APPEARANCE_FILE_VERSION = 1
const MAX_APPEARANCE_FILE_CHARS = 1024 * 1024
const MODES = ['dark', 'light']
const GENERAL_BACKGROUND_SLOTS = ['header', 'panel', 'dialog', 'primaryButton', 'secondaryButton', 'input', 'aiSummary', 'quickEntry']
const BLOCK_BACKGROUND_SLOTS = [
  'chat', 'commandPanel', 'profiles', 'form', 'skillList', 'accountCard',
  'aiPanel', 'quickPanel', 'aiContent', 'notice', 'intro', 'guide', 'security',
  'announcementDialog', 'helpDialog', 'aiTools', 'aiTaskDrawer', 'aiConversation',
  'aiComposer', 'statusPanel'
]
const BACKGROUND_SLOTS = [...GENERAL_BACKGROUND_SLOTS, ...BLOCK_BACKGROUND_SLOTS]

function defaultComponentBackgrounds() {
  const slots = {}
  for (const slot of BACKGROUND_SLOTS) {
    slots[slot] = Object.freeze({ type: 'none', source: '', fallbackColor: '', size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'scroll', overlay: 'transparent' })
  }
  return Object.freeze(slots)
}

const DEFAULTS = Object.freeze({
  dark: Object.freeze({
    colors: Object.freeze({
      background: '#0c0f12', surface: '#12171b', surfaceRaised: '#151a1f', surfaceMuted: '#252c31',
      border: '#303840', text: '#edf1f4', textMuted: '#9aa7b0', primary: '#3f86b8',
      primaryHover: '#5399ca', primaryContrast: '#ffffff', danger: '#d96b63', success: '#66a780',
      warning: '#d0b16f', overlay: 'rgba(0, 0, 0, 0.72)', inputBackground: '#0d1114', codeBackground: '#181818'
    }),
    typography: Object.freeze({ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSizeOffset: 0, lineHeight: 1.5 }),
    shape: Object.freeze({ radiusSmall: 2, radiusMedium: 6, radiusLarge: 12, borderWidth: 1 }),
    layout: Object.freeze({ density: 1, pagePadding: 18, contentMaxWidth: 0, controlHeight: 58 }),
    effects: Object.freeze({ panelOpacity: 1, shadow: '0 10px 32px rgba(0, 0, 0, 0.28)', backdropBlur: 0 }),
    background: Object.freeze({ type: 'none', source: '', fallbackColor: '', size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'scroll', overlay: 'rgba(0, 0, 0, 0)' }),
    backgrounds: defaultComponentBackgrounds()
  }),
  light: Object.freeze({
    colors: Object.freeze({
      background: '#e8dfc8', surface: '#f1e8d2', surfaceRaised: '#d5cab1', surfaceMuted: '#ddd3ba',
      border: '#9d947d', text: '#2e352f', textMuted: '#687269', primary: '#3f706b',
      primaryHover: '#527f77', primaryContrast: '#ffffff', danger: '#963d38', success: '#376b58',
      warning: '#8a6c2e', overlay: 'rgba(61, 52, 39, 0.3)', inputBackground: '#fff8e7', codeBackground: '#eee5cf'
    }),
    typography: Object.freeze({ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSizeOffset: 0, lineHeight: 1.5 }),
    shape: Object.freeze({ radiusSmall: 2, radiusMedium: 6, radiusLarge: 12, borderWidth: 1 }),
    layout: Object.freeze({ density: 1, pagePadding: 18, contentMaxWidth: 0, controlHeight: 58 }),
    effects: Object.freeze({ panelOpacity: 1, shadow: '0 10px 32px rgba(61, 52, 39, 0.18)', backdropBlur: 0 }),
    background: Object.freeze({ type: 'none', source: '', fallbackColor: '', size: 'cover', position: 'center center', repeat: 'no-repeat', attachment: 'scroll', overlay: 'rgba(0, 0, 0, 0)' }),
    backgrounds: defaultComponentBackgrounds()
  })
})

const SECTION_FIELDS = Object.freeze({
  colors: Object.keys(DEFAULTS.dark.colors),
  typography: Object.keys(DEFAULTS.dark.typography),
  shape: Object.keys(DEFAULTS.dark.shape),
  layout: Object.keys(DEFAULTS.dark.layout),
  effects: Object.keys(DEFAULTS.dark.effects),
  background: Object.keys(DEFAULTS.dark.background),
  backgrounds: Object.keys(DEFAULTS.dark.backgrounds)
})

const storedOverrides = { dark: {}, light: {} }
export const appStyle = reactive({})
export const appearanceState = reactive({ mode: 'dark', revision: 0 })

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mergeMode(mode) {
  const base = DEFAULTS[mode]
  const override = storedOverrides[mode] || {}
  const result = {}
  for (const section of Object.keys(SECTION_FIELDS)) {
    if (section === 'backgrounds') {
      result[section] = {}
      for (const slot of BACKGROUND_SLOTS) result[section][slot] = { ...base[section][slot], ...((override[section] || {})[slot] || {}) }
    } else result[section] = { ...base[section], ...(override[section] || {}) }
  }
  return result
}

function safeCssText(value, field, maxLength = 200) {
  const text = String(value == null ? '' : value).trim()
  if (!text || text.length > maxLength || /[;{}<>]|expression\s*\(|javascript\s*:/i.test(text)) {
    throw new Error(field + ' 不是安全的 CSS 值')
  }
  return text
}

function colorValue(value, field) {
  const text = safeCssText(value, field, 120)
  if (!/^(?:#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([\d.%\s,/+-]+\)|hsla?\([\d.%\s,/+-]+\)|transparent|currentColor)$/i.test(text)) {
    throw new Error(field + ' 必须是 hex、rgb/rgba、hsl/hsla 或 transparent')
  }
  return text
}

function numberValue(value, field, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(field + ' 必须在 ' + min + '-' + max + ' 之间')
  return number
}

function enumValue(value, field, values) {
  const text = String(value || '').trim()
  if (!values.includes(text)) throw new Error(field + ' 必须是：' + values.join('、'))
  return text
}

function sanitizeSvg(source) {
  const svg = String(source || '').trim()
  if (!/^<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg) || svg.length > 50000) throw new Error('SVG 背景必须是完整且不超过 50000 字符的 <svg>')
  if (/<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=|javascript\s*:|@import|url\s*\(\s*(?!#|["']#)|(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(svg)) {
    throw new Error('SVG 背景包含脚本、事件或外部资源，已拒绝')
  }
  return svg
}

function imageSource(value) {
  const source = String(value || '').trim()
  if (!source || source.length > 50000 || /^(?:javascript|vbscript):/i.test(source) || /[\r\n]/.test(source)) throw new Error('图片背景地址无效')
  const scheme = source.match(/^([a-z][a-z0-9+.-]*):/i)
  if (scheme && !/^(?:https?|file|data|blob|wxfile)$/i.test(scheme[1])) throw new Error('图片背景不支持该 URL 协议：' + scheme[1])
  if (/^data:/i.test(source) && !/^data:image\/(?:png|jpe?g|gif|webp|avif);/i.test(source)) {
    throw new Error('图片 data URL 仅支持 PNG、JPEG、GIF、WebP 或 AVIF；SVG 请使用 type=svg')
  }
  return source
}

function normalizeSection(section, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error(section + ' 必须是对象')
  if (section === 'backgrounds') {
    const backgrounds = {}
    for (const [slot, config] of Object.entries(values)) {
      if (!BACKGROUND_SLOTS.includes(slot)) throw new Error('不支持的背景槽：backgrounds.' + slot)
      backgrounds[slot] = normalizeSection('background', config)
    }
    return backgrounds
  }
  const allowed = SECTION_FIELDS[section]
  const result = {}
  for (const [field, raw] of Object.entries(values)) {
    if (!allowed.includes(field)) throw new Error('不支持的样式字段：' + section + '.' + field)
    if (section === 'colors') result[field] = colorValue(raw, section + '.' + field)
    else if (section === 'typography') {
      if (field === 'fontFamily') result[field] = safeCssText(raw, section + '.' + field)
      else if (field === 'fontSizeOffset') result[field] = numberValue(raw, section + '.' + field, -8, 16)
      else result[field] = numberValue(raw, section + '.' + field, 1, 2.2)
    } else if (section === 'shape') {
      result[field] = numberValue(raw, section + '.' + field, field === 'borderWidth' ? 0 : 0, field === 'borderWidth' ? 4 : 80)
    } else if (section === 'layout') {
      if (field === 'density') result[field] = numberValue(raw, section + '.' + field, 0.7, 1.4)
      else if (field === 'contentMaxWidth') result[field] = numberValue(raw, section + '.' + field, 0, 2400)
      else result[field] = numberValue(raw, section + '.' + field, 0, 160)
    } else if (section === 'effects') {
      if (field === 'panelOpacity') result[field] = numberValue(raw, section + '.' + field, 0.2, 1)
      else if (field === 'backdropBlur') result[field] = numberValue(raw, section + '.' + field, 0, 40)
      else result[field] = safeCssText(raw, section + '.' + field)
    } else if (section === 'background') {
      if (field === 'type') result[field] = enumValue(raw, section + '.' + field, ['none', 'image', 'svg'])
      else if (field === 'source') result[field] = values.type === 'svg' ? sanitizeSvg(raw) : imageSource(raw)
      else if (field === 'fallbackColor' || field === 'overlay') result[field] = colorValue(raw, section + '.' + field)
      else if (field === 'size') result[field] = safeCssText(raw, section + '.' + field)
      else if (field === 'position') result[field] = safeCssText(raw, section + '.' + field)
      else if (field === 'repeat') result[field] = enumValue(raw, section + '.' + field, ['no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'space', 'round'])
      else result[field] = enumValue(raw, section + '.' + field, ['scroll', 'fixed', 'local'])
    }
  }
  if (section === 'background' && result.source && !result.type) throw new Error('设置 background.source 时必须同时提供 background.type')
  return result
}

function svgDataUrl(svg) {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
}

function cssUrl(source) {
  return 'url("' + String(source).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")'
}

function backgroundImage(config) {
  if (config.type === 'none' || !config.source) return config.overlay === 'rgba(0, 0, 0, 0)' || config.overlay === 'transparent'
    ? 'none'
    : 'linear-gradient(' + config.overlay + ', ' + config.overlay + ')'
  const source = config.type === 'svg' ? svgDataUrl(config.source) : runtime.resolveAssetUrl(config.source)
  const image = cssUrl(source)
  if (config.overlay === 'rgba(0, 0, 0, 0)' || config.overlay === 'transparent') return image
  return 'linear-gradient(' + config.overlay + ', ' + config.overlay + '), ' + image
}

function componentBackgroundVariables(backgrounds, overrides) {
  const variables = {}
  const semanticColors = {
    header: 'var(--app-surface-raised-alpha)', panel: 'var(--app-surface-alpha)', dialog: 'var(--app-surface-alpha)',
    primaryButton: 'var(--app-primary)', secondaryButton: 'var(--app-surface-muted)', input: 'var(--app-input-background)',
    aiSummary: 'var(--app-surface)', quickEntry: 'var(--app-primary)'
  }
  const customizedBackgrounds = (overrides && overrides.backgrounds) || {}
  for (const slot of BACKGROUND_SLOTS) {
    // Block variables only exist after an explicit override. Their CSS fallback is
    // the general panel slot, which preserves both defaults and existing themes.
    const customized = customizedBackgrounds[slot] && Object.keys(customizedBackgrounds[slot]).length > 0
    if (BLOCK_BACKGROUND_SLOTS.includes(slot) && !customized) continue
    const config = backgrounds[slot]
    const normalizedSlot = slot === 'aiSummary' ? 'ai-summary-slot' : slot === 'quickEntry' ? 'quick-entry-slot' : slot.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())
    const prefix = '--app-' + normalizedSlot + '-background-'
    variables[prefix + 'image'] = backgroundImage(config)
    variables[prefix + 'color'] = config.fallbackColor || semanticColors[slot] || 'var(--app-panel-background-color)'
    variables[prefix + 'size'] = config.size
    variables[prefix + 'position'] = config.position
    variables[prefix + 'repeat'] = config.repeat
    variables[prefix + 'attachment'] = config.attachment
  }
  return variables
}

function specialComponentVariables(config, overrides, mode) {
  const custom = overrides || {}
  const customBackgrounds = custom.backgrounds || {}
  const colorsCustomized = Boolean(custom.colors && Object.keys(custom.colors).length)
  const shapeCustomized = Boolean(custom.shape && Object.keys(custom.shape).length)
  const effectsCustomized = Boolean(custom.effects && Object.keys(custom.effects).length)
  const summaryBackgroundCustomized = Boolean(customBackgrounds.aiSummary || customBackgrounds.panel)
  const quickBackgroundCustomized = Boolean(customBackgrounds.quickEntry || customBackgrounds.primaryButton)
  const summarySlot = customBackgrounds.aiSummary ? 'ai-summary-slot' : 'panel'
  const quickSlot = customBackgrounds.quickEntry ? 'quick-entry-slot' : 'primary-button'
  const light = mode === 'light'
  return {
    '--app-ai-summary-background-color': summaryBackgroundCustomized || colorsCustomized ? 'var(--app-' + summarySlot + '-background-color)' : (light ? '#e4e7d8' : '#151c18'),
    '--app-ai-summary-background-image': summaryBackgroundCustomized ? 'var(--app-' + summarySlot + '-background-image)' : 'none',
    '--app-ai-summary-background-size': summaryBackgroundCustomized ? 'var(--app-' + summarySlot + '-background-size)' : 'cover',
    '--app-ai-summary-background-position': summaryBackgroundCustomized ? 'var(--app-' + summarySlot + '-background-position)' : 'center',
    '--app-ai-summary-background-repeat': summaryBackgroundCustomized ? 'var(--app-' + summarySlot + '-background-repeat)' : 'no-repeat',
    '--app-ai-summary-border-color': colorsCustomized ? 'var(--app-border)' : (light ? '#718978' : '#365b4a'),
    '--app-ai-summary-border-width': shapeCustomized ? 'var(--app-border-width)' : '1rpx',
    '--app-ai-summary-radius': shapeCustomized ? 'var(--app-radius-medium)' : '0rpx',
    '--app-ai-summary-shadow': effectsCustomized ? 'var(--app-shadow)' : 'none',
    '--app-ai-summary-text': colorsCustomized ? 'var(--app-text)' : (light ? '#2e3831' : '#e8eee9'),
    '--app-quick-entry-background-color': quickBackgroundCustomized || colorsCustomized ? 'var(--app-' + quickSlot + '-background-color)' : (light ? 'rgba(64, 91, 88, 0.95)' : 'rgba(38, 47, 54, 0.94)'),
    '--app-quick-entry-background-image': quickBackgroundCustomized ? 'var(--app-' + quickSlot + '-background-image)' : 'none',
    '--app-quick-entry-background-size': quickBackgroundCustomized ? 'var(--app-' + quickSlot + '-background-size)' : 'cover',
    '--app-quick-entry-background-position': quickBackgroundCustomized ? 'var(--app-' + quickSlot + '-background-position)' : 'center',
    '--app-quick-entry-background-repeat': quickBackgroundCustomized ? 'var(--app-' + quickSlot + '-background-repeat)' : 'no-repeat',
    '--app-quick-entry-border-color': colorsCustomized ? 'var(--app-primary-hover)' : (light ? '#75918a' : '#6d7882'),
    '--app-quick-entry-border-width': shapeCustomized ? 'var(--app-border-width)' : '1rpx',
    '--app-quick-entry-radius': shapeCustomized ? 'var(--app-radius-large)' : '50%',
    '--app-quick-entry-shadow': effectsCustomized ? 'var(--app-shadow)' : (light ? '0 5rpx 18rpx rgba(61, 52, 39, 0.3)' : '0 4rpx 14rpx rgba(0, 0, 0, 0.58)'),
    '--app-quick-entry-text': colorsCustomized ? 'var(--app-primary-contrast)' : (light ? '#ffffff' : '#e5edf2')
  }
}

function replaceReactive(target, values) {
  for (const key of Object.keys(target)) if (!(key in values)) delete target[key]
  Object.assign(target, values)
}

function cssVariables(config, overrides, mode) {
  const { colors, typography, shape, layout, effects, background, backgrounds } = config
  const alphaColor = (value, opacity = effects.panelOpacity) => {
    const hex = String(value).match(/^#([0-9a-f]{6})$/i)
    if (hex) {
      const channels = [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16))
      return 'rgba(' + channels.join(', ') + ', ' + opacity + ')'
    }
    const rgb = String(value).match(/^rgb\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*\)$/i)
    return rgb ? 'rgba(' + rgb.slice(1).join(', ') + ', ' + opacity + ')' : value
  }
  return {
    ...componentBackgroundVariables(backgrounds, overrides),
    ...specialComponentVariables(config, overrides, mode),
    '--app-background': background.fallbackColor || colors.background,
    '--app-surface': colors.surface,
    '--app-surface-raised': colors.surfaceRaised,
    '--app-surface-muted': colors.surfaceMuted,
    '--app-surface-alpha': alphaColor(colors.surface),
    '--app-surface-raised-alpha': alphaColor(colors.surfaceRaised),
    '--app-border': colors.border,
    '--app-text': colors.text,
    '--app-text-muted': colors.textMuted,
    '--app-primary': colors.primary,
    '--app-primary-hover': colors.primaryHover,
    '--app-primary-soft': alphaColor(colors.primary, 0.15),
    '--app-primary-contrast': colors.primaryContrast,
    '--app-danger': colors.danger,
    '--app-danger-soft': alphaColor(colors.danger, 0.15),
    '--app-success': colors.success,
    '--app-success-soft': alphaColor(colors.success, 0.15),
    '--app-warning': colors.warning,
    '--app-overlay': colors.overlay,
    '--app-input-background': colors.inputBackground,
    '--app-code-background': colors.codeBackground,
    '--app-font-family': typography.fontFamily,
    '--app-font-size-offset': typography.fontSizeOffset + 'rpx',
    '--app-line-height': String(typography.lineHeight),
    '--app-radius-small': shape.radiusSmall + 'rpx',
    '--app-radius-medium': shape.radiusMedium + 'rpx',
    '--app-radius-large': shape.radiusLarge + 'rpx',
    '--app-border-width': shape.borderWidth + 'rpx',
    '--app-density': String(layout.density),
    '--app-page-padding': Math.round(layout.pagePadding * layout.density * 100) / 100 + 'rpx',
    '--app-density-gap': Math.round(12 * layout.density * 100) / 100 + 'rpx',
    '--app-content-max-width': layout.contentMaxWidth > 0 ? layout.contentMaxWidth + 'px' : 'none',
    '--app-control-height': Math.round(layout.controlHeight * layout.density * 100) / 100 + 'rpx',
    '--app-panel-opacity': String(effects.panelOpacity),
    '--app-shadow': effects.shadow,
    '--app-backdrop-blur': effects.backdropBlur + 'px',
    backgroundColor: background.fallbackColor || colors.background,
    backgroundImage: backgroundImage(background),
    backgroundSize: background.size,
    backgroundPosition: background.position,
    backgroundRepeat: background.repeat,
    backgroundAttachment: background.attachment
  }
}

function persist() {
  runtime.setStorageSync(APPEARANCE_STORAGE_KEY, JSON.stringify(storedOverrides))
}

export function loadAppAppearance() {
  let saved
  try { saved = runtime.getStorageSync(APPEARANCE_STORAGE_KEY) } catch (_) { return }
  if (!saved) return
  try {
    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved
    for (const mode of MODES) {
      if (!parsed || !parsed[mode] || typeof parsed[mode] !== 'object') continue
      const next = {}
      for (const section of Object.keys(SECTION_FIELDS)) {
        if (parsed[mode][section]) next[section] = normalizeSection(section, parsed[mode][section])
      }
      storedOverrides[mode] = next
    }
  } catch (_) {
    storedOverrides.dark = {}
    storedOverrides.light = {}
  }
}

export function applyAppAppearance(mode = appearanceState.mode) {
  const normalizedMode = mode === 'light' ? 'light' : 'dark'
  appearanceState.mode = normalizedMode
  const config = mergeMode(normalizedMode)
  const style = cssVariables(config, storedOverrides[normalizedMode], normalizedMode)
  style.colorScheme = normalizedMode
  replaceReactive(appStyle, style)
  appearanceState.revision += 1
  runtime.applyAppStyle(style)
  runtime.setBackgroundColor({ backgroundColor: style.backgroundColor })
  runtime.setNavigationBarColor({
    frontColor: normalizedMode === 'light' ? '#000000' : '#ffffff',
    backgroundColor: style.backgroundColor
  })
  return getAppAppearance(normalizedMode)
}

export function getAppAppearance(mode = appearanceState.mode) {
  const normalizedMode = mode === 'light' ? 'light' : 'dark'
  return { mode: normalizedMode, config: clone(mergeMode(normalizedMode)), overrides: clone(storedOverrides[normalizedMode] || {}) }
}

export function updateAppAppearance(mode, patch, options = {}) {
  const targets = mode === 'both' ? MODES : [mode === 'light' ? 'light' : 'dark']
  const normalizedPatch = {}
  for (const section of Object.keys(patch || {})) {
    if (!SECTION_FIELDS[section]) throw new Error('不支持的样式分组：' + section)
    normalizedPatch[section] = normalizeSection(section, patch[section])
  }
  const snapshot = clone(storedOverrides)
  for (const target of targets) {
    for (const [section, values] of Object.entries(normalizedPatch)) {
      if (section === 'backgrounds') {
        const current = storedOverrides[target][section] || {}
        storedOverrides[target][section] = { ...current }
        for (const [slot, config] of Object.entries(values)) {
          if (Object.keys(config).length) storedOverrides[target][section][slot] = { ...(current[slot] || {}), ...config }
        }
      } else storedOverrides[target][section] = { ...(storedOverrides[target][section] || {}), ...values }
    }
  }
  if (options.previewOnly) {
    const result = targets.map((target) => getAppAppearance(target))
    storedOverrides.dark = snapshot.dark
    storedOverrides.light = snapshot.light
    return result
  }
  persist()
  applyAppAppearance(appearanceState.mode)
  return targets.map((target) => getAppAppearance(target))
}

export function resetAppAppearance(mode, sections = [], backgroundSlots = []) {
  for (const slot of backgroundSlots) {
    if (!BACKGROUND_SLOTS.includes(slot)) throw new Error('不支持的背景槽：backgrounds.' + slot)
  }
  const targets = mode === 'both' ? MODES : [mode === 'light' ? 'light' : 'dark']
  for (const target of targets) {
    if (!sections.length && !backgroundSlots.length) storedOverrides[target] = {}
    else {
      for (const section of sections) delete storedOverrides[target][section]
      if (backgroundSlots.length && storedOverrides[target].backgrounds) {
        for (const slot of backgroundSlots) {
          delete storedOverrides[target].backgrounds[slot]
        }
        if (!Object.keys(storedOverrides[target].backgrounds).length) delete storedOverrides[target].backgrounds
      }
    }
  }
  persist()
  applyAppAppearance(appearanceState.mode)
  return targets.map((target) => getAppAppearance(target))
}

function normalizedFileMode(value, mode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('样式文件缺少 ' + mode + ' 主题')
  const result = {}
  for (const [section, sectionValue] of Object.entries(value)) {
    if (!SECTION_FIELDS[section]) throw new Error('样式文件包含未知分组：' + section)
    result[section] = normalizeSection(section, sectionValue)
  }
  return result
}

export function exportAppAppearanceText() {
  return JSON.stringify({
    format: APPEARANCE_FILE_FORMAT,
    version: APPEARANCE_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    appearance: clone(storedOverrides)
  }, null, 2) + '\n'
}

export function importAppAppearanceText(source) {
  const text = String(source || '').replace(/^\uFEFF/, '')
  if (!text.trim() || text.length > MAX_APPEARANCE_FILE_CHARS) throw new Error('样式文件为空或超过 1MB')
  let parsed
  try { parsed = JSON.parse(text) } catch (error) { throw new Error('样式文件 JSON 格式错误：' + error.message) }
  if (!parsed || parsed.format !== APPEARANCE_FILE_FORMAT || parsed.version !== APPEARANCE_FILE_VERSION) {
    throw new Error('不是受支持的 Mud Agent 样式文件')
  }
  const appearance = parsed.appearance
  const nextDark = normalizedFileMode(appearance && appearance.dark, 'dark')
  const nextLight = normalizedFileMode(appearance && appearance.light, 'light')
  storedOverrides.dark = nextDark
  storedOverrides.light = nextLight
  persist()
  applyAppAppearance(appearanceState.mode)
  return { format: parsed.format, version: parsed.version, exportedAt: parsed.exportedAt || '', modes: MODES.slice() }
}

export function appAppearanceSchema() {
  return clone(SECTION_FIELDS)
}

loadAppAppearance()

export default { appStyle, appearanceState, applyAppAppearance, getAppAppearance, updateAppAppearance, resetAppAppearance, exportAppAppearanceText, importAppAppearanceText, appAppearanceSchema }
