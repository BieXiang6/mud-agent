import { createUniappPlatform } from './uniapp.js'
import { createElectronPlatform, hasElectronBridge } from './electron.js'

let activePlatform = null

function validatePlatform(platform) {
  if (!platform || typeof platform.openSocket !== 'function') {
    throw new Error('平台适配器必须实现 openSocket(options)')
  }
  return platform
}

export function getPlatform() {
  if (!activePlatform) activePlatform = hasElectronBridge() ? createElectronPlatform() : createUniappPlatform()
  return activePlatform
}

export function configurePlatform(platform) {
  activePlatform = validatePlatform(platform)
  return activePlatform
}

export function resetPlatform() {
  activePlatform = null
}

function forward(name, args) {
  const platform = getPlatform()
  const method = platform[name]
  if (typeof method !== 'function') throw new Error('当前平台未实现 ' + name)
  return method.apply(platform, args)
}

export const runtime = {
  getStorageSync(...args) { return forward('getStorageSync', args) },
  setStorageSync(...args) { return forward('setStorageSync', args) },
  removeStorageSync(...args) { return forward('removeStorageSync', args) },
  showModal(...args) { return forward('showModal', args) },
  showToast(...args) { return forward('showToast', args) },
  navigateTo(...args) { return forward('navigateTo', args) },
  navigateBack(...args) { return forward('navigateBack', args) },
  reLaunch(...args) { return forward('reLaunch', args) },
  setClipboardData(...args) { return forward('setClipboardData', args) },
  setBackgroundColor(...args) { return forward('setBackgroundColor', args) },
  setNavigationBarColor(...args) { return forward('setNavigationBarColor', args) },
  getWindowInfo(...args) { return forward('getWindowInfo', args) },
  getAppVersion(...args) { return forward('getAppVersion', args) },
  openUrl(...args) { return forward('openUrl', args) },
  setWakeLock(...args) { return forward('setWakeLock', args) },
  getCurrentPages(...args) { return forward('getCurrentPages', args) },
  resolveAssetUrl(...args) { return forward('resolveAssetUrl', args) },
  applyAppStyle(...args) { return forward('applyAppStyle', args) },
  getRuntimeCapabilities(...args) { return forward('getRuntimeCapabilities', args) },
  exportTextFile(...args) { return forward('exportTextFile', args) },
  importTextFile(...args) { return forward('importTextFile', args) }
}

export default { getPlatform, configurePlatform, resetPlatform, runtime }
