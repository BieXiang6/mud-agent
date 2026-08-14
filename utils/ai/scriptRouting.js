const EXPLICIT_SCRIPT = /(?:write-game-script|list_game_scripts|get_game_script|save_game_script|delete_game_script|run_game_script|get_script_run|cancel_script_run)/i
const SCRIPT_INTENT = /(?:javascript|\bjs\b|脚本).{0,20}(?:编写|写|创建|新增|修改|编辑|保存|管理|删除|查询|执行|运行|调用|停止|取消|函数|自动|监听)|(?:编写|写|创建|新增|修改|编辑|保存|管理|删除|查询|执行|运行|调用|停止|取消).{0,20}(?:javascript|\bjs\b|脚本)|(?:执行|调用).{0,12}(?:脚本|函数)|\brun-[a-z0-9-]+\b/i
const SCRIPT_FOLLOW_UP = /(?:这个|该|刚才的|上面的)?\s*(?:脚本|函数)|(?:再|继续)\s*(?:运行|执行|修改|保存)|(?:传参|返回值|非阻塞|运行状态)/i

function matches(pattern, value) {
  pattern.lastIndex = 0
  return pattern.test(String(value || ''))
}

export function shouldInjectScriptTools(currentTask, recentHistory = '') {
  if (matches(EXPLICIT_SCRIPT, currentTask) || matches(SCRIPT_INTENT, currentTask)) return true
  return (matches(EXPLICIT_SCRIPT, recentHistory) || matches(SCRIPT_INTENT, recentHistory)) && matches(SCRIPT_FOLLOW_UP, currentTask)
}

export default { shouldInjectScriptTools }
