const { clipboard, contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mudElectron', {
  isElectron: true,
  quickUiSmokeTest: process.argv.includes('--mud-quick-ui-smoke-test'),
  appVersion: ipcRenderer.sendSync('mud:get-app-version'),
  clipboard: {
    writeText(text) { clipboard.writeText(String(text || '')) }
  },
  openExternal(url) {
    return ipcRenderer.invoke('mud:open-external', String(url || ''))
  },
  showModal(options) {
    return ipcRenderer.invoke('mud:show-modal', options)
  },
  files: {
    exportText(options) { return ipcRenderer.invoke('mud:export-text-file', options) },
    importText(options) { return ipcRenderer.invoke('mud:import-text-file', options) }
  },
  http: {
    fetch(request) { return ipcRenderer.invoke('mud:http-fetch', request) }
  },
  tcp: {
    connect(id, host, port) { return ipcRenderer.invoke('mud:tcp-connect', { id, host, port }) },
    send(id, data) { return ipcRenderer.invoke('mud:tcp-send', { id, data }) },
    close(id, reason) { return ipcRenderer.invoke('mud:tcp-close', { id, reason }) },
    onEvent(callback) {
      ipcRenderer.on('mud:tcp-event', (_event, payload) => callback(payload))
    }
  }
})
