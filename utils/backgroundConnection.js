import { log } from './log.js'
import { getPlatform } from './platform/index.js'

let cpuWakeLock = null
let wifiLock = null

function getAndroidApi() {
  const platform = getPlatform()
  return platform.getAndroidApi ? platform.getAndroidApi() : null
}

export function acquireBackgroundConnectionLocks() {
  // #ifdef APP-PLUS
  const android = getAndroidApi()
  if (!android || !android.runtimeMainActivity || cpuWakeLock || wifiLock) return
  try {
    const activity = android.runtimeMainActivity()
    const context = activity.getApplicationContext()
    const Context = android.importClass('android.content.Context')
    const PowerManager = android.importClass('android.os.PowerManager')
    const WifiManager = android.importClass('android.net.wifi.WifiManager')

    const powerManager = context.getSystemService(Context.POWER_SERVICE)
    cpuWakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, 'mud-agent:tcp')
    android.importClass(cpuWakeLock)
    cpuWakeLock.setReferenceCounted(false)
    cpuWakeLock.acquire()

    const wifiManager = context.getSystemService(Context.WIFI_SERVICE)
    const wifiMode = WifiManager.WIFI_MODE_FULL_HIGH_PERF || 3
    wifiLock = wifiManager.createWifiLock(wifiMode, 'mud-agent:tcp')
    android.importClass(wifiLock)
    wifiLock.setReferenceCounted(false)
    wifiLock.acquire()
    log('NET', '已启用后台 TCP CPU/Wi-Fi 保持锁')
  } catch (error) {
    log('NET', '启用后台连接保持失败:', error && (error.message || error.errMsg || String(error)))
    releaseBackgroundConnectionLocks()
  }
  // #endif
}

export function releaseBackgroundConnectionLocks() {
  // #ifdef APP-PLUS
  const android = getAndroidApi()
  if (wifiLock) {
    try {
      if (android) android.importClass(wifiLock)
      if (!wifiLock.isHeld || wifiLock.isHeld()) wifiLock.release()
    } catch (_) {}
    wifiLock = null
  }
  if (cpuWakeLock) {
    try {
      if (android) android.importClass(cpuWakeLock)
      if (!cpuWakeLock.isHeld || cpuWakeLock.isHeld()) cpuWakeLock.release()
    } catch (_) {}
    cpuWakeLock = null
  }
  // #endif
}

export default { acquireBackgroundConnectionLocks, releaseBackgroundConnectionLocks }
