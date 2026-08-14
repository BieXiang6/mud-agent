export function buildActionDialog(current, fallbackTitle, layout) {
  const previousButtons = current && Array.isArray(current.buttons) ? current.buttons : []
  const incomingButtons = layout && Array.isArray(layout.buttons) ? layout.buttons : []
  const mergedLayout = {
    ...layout,
    buttons: previousButtons.length ? previousButtons.concat(incomingButtons) : incomingButtons
  }

  if (current && current.type === 'input') {
    return { ...current, ...mergedLayout }
  }

  let introLines = []
  if (current && current.type === 'hd' && Array.isArray(current.lines)) {
    introLines = current.lines
  } else if (current && current.type === 'act' && Array.isArray(current.introLines)) {
    // 008/009 may arrive as consecutive updates for one dialog. Keep the
    // text that was already merged from the preceding 007 packet.
    introLines = current.introLines
  }

  return {
    type: 'act',
    title: (current && current.title) || fallbackTitle || '',
    introLines,
    ...mergedLayout
  }
}
