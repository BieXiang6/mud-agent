const EXPLICIT_APPEARANCE = /(?:customize-app-style|adapt-app-layout|configure_app_style|get_app_style|reset_app_style)/i
const STRONG_APPEARANCE = /(?:样式|主题|皮肤|外观|配色|字体|字号|圆角|阴影|透明度|毛玻璃|壁纸|响应式(?:布局|适配|界面)?|界面\s*(?:颜色|布局|背景)|(?:按钮|面板|输入框).{0,10}(?:颜色|背景|图片|svg|样式|改|换|圆角)|(?:应用|客户端|app|ui)\s*(?:界面)?\s*(?:背景|颜色|布局|排版|美化|适配|兼容)|(?:背景|底图)\s*(?:图片|图案|svg|颜色|换|改|设置|使用)|(?:pc|电脑|桌面端|uni-?app|移动端|手机端).{0,12}(?:适配|兼容|布局|样式|背景)|(?:适配|兼容).{0,12}(?:pc|电脑|桌面端|uni-?app|移动端|手机端)|(?:app|ui).{0,16}(?:style|theme|appearance|background|layout)|(?:style|theme|appearance).{0,16}(?:app|ui)|(?:dark|light)\s+theme|svg\s*background)/i
const APPEARANCE_FOLLOW_UP = /(?:再|继续)?\s*(?:调|改|换|恢复|撤销)|(?:亮|暗|透明|圆|大|小|紧凑|宽松|红|蓝|绿|紫|黑|白).{0,6}(?:一点|一些|点儿)|(?:颜色|背景|按钮|面板|字体|字号|圆角|阴影)/i
const GAME_INTENT = /(?:向?[东南西北]|走|攻击|战斗|打|杀|房间|背包|装备|物品|角色|人物|门派|聊天|任务|出口|地图|招式|武功|技能|血量|内力)/i

function matches(pattern, value) {
  pattern.lastIndex = 0
  return pattern.test(value)
}

export function shouldInjectAppAppearanceTools(currentTask, recentHistory = '') {
  const current = String(currentTask || '').trim()
  if (!current) return false
  if (matches(EXPLICIT_APPEARANCE, current) || matches(STRONG_APPEARANCE, current)) return true

  const history = String(recentHistory || '').slice(-6000)
  const hasAppearanceHistory = matches(EXPLICIT_APPEARANCE, history) || matches(STRONG_APPEARANCE, history)
  return hasAppearanceHistory && matches(APPEARANCE_FOLLOW_UP, current) && !matches(GAME_INTENT, current)
}

export default { shouldInjectAppAppearanceTools }
