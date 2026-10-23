import { cancelScriptRun, compileScript, getScriptRun, runStoredScript } from './scriptRuntime.js'
import { deleteStoredScript, getStoredScript, listStoredScripts, saveStoredScript, scriptStoreLimits } from './scriptStore.js'
import { applyScriptEdits } from './scriptEditing.js'

function objectSchema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false }
}

function success(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], details: data }
}

const emptySchema = objectSchema({})
const scriptKey = { type: 'string', minLength: 1, maxLength: 100, description: '脚本 ID；也可使用唯一脚本名称' }

export function createScriptTools(session) {
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
      description: '读取脚本及版本 updatedAt。可用 startLine/endLine 只读取指定行段（从 1 开始、包含结束行），lineNumbers=true 附带行号视图。修改前先读取，局部修改优先使用 edit_game_script。',
      parameters: objectSchema({
        scriptId: scriptKey,
        startLine: { type: 'integer', minimum: 1 },
        endLine: { type: 'integer', minimum: 1 },
        lineNumbers: { type: 'boolean', description: '附带 numberedSource；编辑 oldText 时不要包含显示行号' }
      }, ['scriptId']),
      executionMode: 'sequential',
      execute: async (_id, params) => {
        const script = getStoredScript(params.scriptId)
        if (!script) throw new Error('脚本不存在：' + params.scriptId)
        const newline = script.source.includes('\r\n') ? '\r\n' : '\n'
        const lines = script.source.split(newline)
        const startLine = params.startLine == null ? 1 : params.startLine
        const endLine = params.endLine == null ? lines.length : params.endLine
        if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) throw new Error('读取行范围无效，共 ' + lines.length + ' 行')
        const source = lines.slice(startLine - 1, endLine).join(newline)
        return success({ ...script, source, startLine, endLine, totalLines: lines.length,
          ...(params.lineNumbers ? { numberedSource: lines.slice(startLine - 1, endLine).map((line, index) => (startLine + index) + ': ' + line).join('\n') } : {}) })
      }
    },
    {
      name: 'edit_game_script',
      label: '局部修改游戏脚本',
      description: '修改已有脚本，无需重传完整源码。提供读取到的 updatedAt 作为 expectedUpdatedAt。edits 按顺序作用于前一处修改后的内容；默认 oldText 必须精确且唯一匹配。指定 startLine/endLine 则替换完整行并校验 oldText；插入时 endLine=startLine-1、oldText=""；newText="" 表示删除。任一失败整批不保存。成功仅返回版本和变更摘要，需要查看时按行读取。',
      parameters: objectSchema({
        scriptId: scriptKey,
        expectedUpdatedAt: { type: 'integer', minimum: 0 },
        edits: { type: 'array', minItems: 1, maxItems: 50, items: objectSchema({
          oldText: { type: 'string', maxLength: scriptStoreLimits.maxSourceChars },
          newText: { type: 'string', maxLength: scriptStoreLimits.maxSourceChars },
          startLine: { type: 'integer', minimum: 1 },
          endLine: { type: 'integer', minimum: 0 }
        }, ['oldText', 'newText']) }
      }, ['scriptId', 'expectedUpdatedAt', 'edits']),
      executionMode: 'sequential',
      execute: async (_id, params) => {
        const script = getStoredScript(params.scriptId)
        if (!script) throw new Error('脚本不存在：' + params.scriptId)
        if (!Number.isInteger(params.expectedUpdatedAt) || params.expectedUpdatedAt !== script.updatedAt) throw new Error('脚本已被修改或缺少版本，请重新读取后再编辑')
        const result = applyScriptEdits(script.source, params.edits)
        compileScript(result.source)
        const { source, ...saved } = saveStoredScript({ ...script, source: result.source, expectedUpdatedAt: params.expectedUpdatedAt })
        return success({ saved: { ...saved, sourceLength: source.length, totalLines: source.split('\n').length }, changes: result.changes })
      }
    },
    {
      name: 'save_game_script',
      label: '保存游戏脚本',
      description: '新建或完整重写可复用的受限 JavaScript 游戏脚本；已有脚本的小范围调整优先使用 edit_game_script。源码必须通过 exports.<函数名> 导出函数。更新时提供 scriptId 和 expectedUpdatedAt，避免覆盖并发修改。',
      parameters: objectSchema({
        scriptId: { type: 'string', maxLength: 100 },
        name: { type: 'string', minLength: 1, maxLength: 80 },
        description: { type: 'string', maxLength: 500 },
        source: { type: 'string', minLength: 1, maxLength: scriptStoreLimits.maxSourceChars },
        expectedUpdatedAt: { type: 'integer', minimum: 0 }
      }, ['name', 'source']),
      executionMode: 'sequential',
      execute: async (_id, params) => {
        compileScript(params.source)
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
        waitForResult: { type: 'boolean', description: '默认 true；false 为非阻塞执行。运行不会自动超时，需用 cancel_script_run 主动停止。' }
      }, ['scriptId']),
      executionMode: 'sequential',
      execute: async (_id, params, signal) => success(await runStoredScript({ ...params, signal, origin: 'agent', session }))
    },
    {
      name: 'get_script_run',
      label: '查询脚本运行',
      description: '查询非阻塞脚本运行的状态、日志、返回值或错误。',
      parameters: objectSchema({ runId: { type: 'string', minLength: 1, maxLength: 100 } }, ['runId']),
      executionMode: 'sequential',
      execute: async (_id, params) => success(getScriptRun(params.runId, session && session.gameState.sessionId))
    },
    {
      name: 'cancel_script_run',
      label: '停止脚本运行',
      description: '停止仍在排队或运行的非阻塞脚本。',
      parameters: objectSchema({ runId: { type: 'string', minLength: 1, maxLength: 100 } }, ['runId']),
      executionMode: 'sequential',
      execute: async (_id, params) => success(cancelScriptRun(params.runId, session && session.gameState.sessionId))
    }
  ]
}

export default { createScriptTools }
