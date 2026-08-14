function mergeTools(current, additions) {
  const merged = current.slice()
  const names = new Set(merged.map((tool) => tool.name))
  for (const tool of additions) {
    if (!tool || !tool.name || names.has(tool.name)) continue
    merged.push(tool)
    names.add(tool.name)
  }
  return merged
}

export function createSkillToolActivation(resolveTools) {
  let agent = null
  let pendingTools = []
  let refreshNextTurn = false

  const applyPending = () => {
    if (!agent || !pendingTools.length) return
    agent.state.tools = mergeTools(agent.state.tools, pendingTools)
    refreshNextTurn = true
  }

  return {
    attachAgent(nextAgent) {
      agent = nextAgent
      applyPending()
    },
    async onLoad(skill) {
      const additions = await resolveTools(skill)
      const tools = Array.isArray(additions) ? additions.filter((tool) => tool && tool.name) : []
      pendingTools = mergeTools(pendingTools, tools)
      applyPending()
      return tools.map((tool) => tool.name)
    },
    prepareNextTurn({ context }) {
      if (!refreshNextTurn || !agent) return undefined
      refreshNextTurn = false
      return { context: { ...context, tools: agent.state.tools.slice() } }
    }
  }
}

export default { createSkillToolActivation }
