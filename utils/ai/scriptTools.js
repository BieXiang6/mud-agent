import { cancelScriptRun, getScriptRun, runStoredScript, validateScriptSource } from './scriptRuntime.js'
import { deleteStoredScript, getStoredScript, listStoredScripts, saveStoredScript, scriptStoreLimits } from './scriptStore.js'

function objectSchema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false }
}

function success(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], details: data }
}

const emptySchema = objectSchema({})
const scriptKey = { type: 'string', minLength: 1, maxLength: 100, description: '脚本 ID；也可使用唯一脚本名称' }

export function createScriptTools() {
  return [
    {
      name: 'list_game_scripts',
      label: '列出游戏脚本',
      description: '列出已保存脚本的 ID、名称、说明和更新时间，不返回源码。',
      parameters: emptySchema,
      executionMode: 'sequential',
      execute: async () => success({ scripts: listStoredScripts(), limits: scriptStoreLimits })
    },
    {
      name: 'get_game_script',
      label: '读取游戏脚本',
      description: '按 ID 或名称读取一个已保存脚本的完整源码。修改或执行前先读取。',
      parameters: objectSchema({ scriptId: scriptKey }, ['scriptId']),
      executionMode: 'sequential',
      execute: async (_id, params) => {
        const script = getStoredScript(params.scriptId)
        if (!script) throw new Error('脚本不存在：' + params.scriptId)
        return success(script)
      }
    },
    {
      name: 'save_game_script',
      label: '保存游戏脚本',
      description: '新建或更新可复用的受限 JavaScript 游戏脚本。源码必须通过 exports.<函数名> 导出函数。更新时提供 scriptId 和 expectedUpdatedAt，避免覆盖并发修改。',
      parameters: objectSchema({
        scriptId: { type: 'string', maxLength: 100 },
        name: { type: 'string', minLength: 1, maxLength: 80 },
        description: { type: 'string', maxLength: 500 },
        source: { type: 'string', minLength: 1, maxLength: scriptStoreLimits.maxSourceChars },
        expectedUpdatedAt: { type: 'integer', minimum: 0 }
      }, ['name', 'source']),
      executionMode: 'sequential',
      execute: async (_id, params) => {
        validateScriptSource(params.source)
        return success({ saved: saveStoredScript({ ...params, id: params.scriptId }) })
      }
    },
    {
      name: 'delete_game_script',
      label: '删除游戏脚本',
      description: '永久删除一个已保存脚本。只在用户明确要求删除时调用。',
      parameters: objectSchema({ scriptId: scriptKey }, ['scriptId']),
      executionMode: 'sequential',
      execute: async (_id, params) => {
        if (!deleteStoredScript(params.scriptId)) throw new Error('脚本不存在：' + params.scriptId)
        return success({ deleted: true, scriptId: params.scriptId })
      }
    },
    {
      name: 'run_game_script',
      label: '执行游戏脚本函数',
      description: '执行已保存脚本导出的指定函数，可传递 JSON 参数并获取 JSON 返回值。waitForResult=false 时立即返回 runId，使用 get_script_run 查询。',
      parameters: objectSchema({
        scriptId: scriptKey,
        functionName: { type: 'string', pattern: '^[A-Za-z_$][A-Za-z0-9_$]{0,79}$', description: '默认 main' },
        args: { type: 'array', items: {}, maxItems: 20, description: '按位置传给函数的 JSON 参数数组' },
        waitForResult: { type: 'boolean', description: '默认 true；false 为非阻塞执行' },
        timeoutMs: { type: 'integer', minimum: 200, maximum: 600000 }
      }, ['scriptId']),
      executionMode: 'sequential',
      execute: async (_id, params) => success(await runStoredScript(params))
    },
    {
      name: 'get_script_run',
      label: '查询脚本运行',
      description: '查询非阻塞脚本运行的状态、日志、返回值或错误。',
      parameters: objectSchema({ runId: { type: 'string', minLength: 1, maxLength: 100 } }, ['runId']),
      executionMode: 'sequential',
      execute: async (_id, params) => success(getScriptRun(params.runId))
    },
    {
      name: 'cancel_script_run',
      label: '停止脚本运行',
      description: '停止仍在排队或运行的非阻塞脚本。',
      parameters: objectSchema({ runId: { type: 'string', minLength: 1, maxLength: 100 } }, ['runId']),
      executionMode: 'sequential',
      execute: async (_id, params) => success(cancelScriptRun(params.runId))
    }
  ]
}

export default { createScriptTools }
