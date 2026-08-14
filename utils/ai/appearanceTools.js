import { state } from '../store.js'
import { runtime } from '../platform/index.js'
import { appAppearanceSchema, getAppAppearance, resetAppAppearance, updateAppAppearance } from '../appearance.js'

function objectSchema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false }
}

function success(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], details: data }
}

const colorProperties = {}
for (const name of appAppearanceSchema().colors) colorProperties[name] = { type: 'string', maxLength: 120 }

const backgroundProperties = {
  type: { type: 'string', enum: ['none', 'image', 'svg'] },
  source: { type: 'string', maxLength: 50000, description: '图片 URL/相对路径/PC 绝对路径，或完整的安全 SVG 文本' },
  fallbackColor: { type: 'string', maxLength: 120 },
  size: { type: 'string', maxLength: 80, description: '例如 cover、contain、100% 100%' },
  position: { type: 'string', maxLength: 80, description: '例如 center center、top right' },
  repeat: { type: 'string', enum: ['no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'space', 'round'] },
  attachment: { type: 'string', enum: ['scroll', 'fixed', 'local'] },
  overlay: { type: 'string', maxLength: 120, description: '覆盖在背景上的颜色，用于保证文字对比度' }
}
const backgroundSchema = objectSchema(backgroundProperties)
const componentBackgroundProperties = {}
for (const slot of appAppearanceSchema().backgrounds) componentBackgroundProperties[slot] = backgroundSchema

const stylePatchSchema = objectSchema({
  colors: objectSchema(colorProperties),
  typography: objectSchema({
    fontFamily: { type: 'string', maxLength: 200 },
    fontSizeOffset: { type: 'number', minimum: -8, maximum: 16, description: '全局字号增量，单位 rpx' },
    lineHeight: { type: 'number', minimum: 1, maximum: 2.2 }
  }),
  shape: objectSchema({
    radiusSmall: { type: 'number', minimum: 0, maximum: 80 },
    radiusMedium: { type: 'number', minimum: 0, maximum: 80 },
    radiusLarge: { type: 'number', minimum: 0, maximum: 80 },
    borderWidth: { type: 'number', minimum: 0, maximum: 4 }
  }),
  layout: objectSchema({
    density: { type: 'number', minimum: 0.7, maximum: 1.4 },
    pagePadding: { type: 'number', minimum: 0, maximum: 160, description: '页面边距，单位 rpx' },
    contentMaxWidth: { type: 'number', minimum: 0, maximum: 2400, description: 'PC 内容最大宽度，0 表示不限制，单位 px' },
    controlHeight: { type: 'number', minimum: 0, maximum: 160, description: '常规控件高度，单位 rpx' }
  }),
  effects: objectSchema({
    panelOpacity: { type: 'number', minimum: 0.2, maximum: 1 },
    shadow: { type: 'string', maxLength: 200 },
    backdropBlur: { type: 'number', minimum: 0, maximum: 40, description: '单位 px；uni-app 会安全降级' }
  }),
  background: backgroundSchema,
  backgrounds: objectSchema(componentBackgroundProperties)
})

function targetMode(value) {
  if (value === 'both') return 'both'
  if (value === 'light' || value === 'dark') return value
  return state.themeMode
}

export function createAppAppearanceTools() {
  return [
    {
      name: 'get_app_style',
      label: '读取应用样式',
      description: '读取当前或指定明暗模式的完整应用样式、用户覆盖值和 PC/uni-app 运行能力。设计或修改样式前先调用。',
      parameters: objectSchema({ mode: { type: 'string', enum: ['current', 'dark', 'light'] } }),
      executionMode: 'sequential',
      execute: async (_id, params) => {
        const mode = targetMode(params.mode)
        return success({ ...getAppAppearance(mode), capabilities: runtime.getRuntimeCapabilities(), editableFields: appAppearanceSchema() })
      }
    },
    {
      name: 'configure_app_style',
      label: '定制应用样式',
      description: '以增量方式修改并持久化应用样式。支持通用背景和 chat、dialog、AI 面板等具名区块的独立普通图片或原始 SVG 背景。未提供的字段保持不变；重新进入app生效。',
      parameters: objectSchema({
        mode: { type: 'string', enum: ['current', 'dark', 'light', 'both'], description: '默认 current；both 适合两套模式共用的排版和形状' },
        style: stylePatchSchema
      }, ['style']),
      executionMode: 'sequential',
      execute: async (_id, params) => success({ updated: updateAppAppearance(targetMode(params.mode), params.style), activeMode: state.themeMode, notice: '重新进入app生效' })
    },
    {
      name: 'reset_app_style',
      label: '重置应用样式',
      description: '恢复指定模式的全部、部分分组或指定区块背景。移除区块覆盖后会重新继承通用样式；重新进入app生效。',
      parameters: objectSchema({
        mode: { type: 'string', enum: ['current', 'dark', 'light', 'both'] },
        sections: { type: 'array', items: { type: 'string', enum: Object.keys(appAppearanceSchema()) }, uniqueItems: true, maxItems: Object.keys(appAppearanceSchema()).length, description: '重置整个样式分组；与 backgroundSlots 都留空时重置全部' },
        backgroundSlots: { type: 'array', items: { type: 'string', enum: appAppearanceSchema().backgrounds }, uniqueItems: true, maxItems: appAppearanceSchema().backgrounds.length, description: '只移除指定区块的背景覆盖，使其重新继承通用样式' }
      }),
      executionMode: 'sequential',
      execute: async (_id, params) => success({ reset: resetAppAppearance(targetMode(params.mode), params.sections || [], params.backgroundSlots || []), activeMode: state.themeMode, notice: '重新进入app生效' })
    }
  ]
}

export default { createAppAppearanceTools }
