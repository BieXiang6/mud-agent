import { getPlatform, runtime } from './platform/index.js'
import { clientConfig } from './config.js'

export const DEFAULT_RELEASE_API_BASE_URL = clientConfig.release.apiBaseUrl

export function getReleaseApiBaseUrl() {
  const configured = runtime.getStorageSync('mud_release_api_url')
  return String(configured || DEFAULT_RELEASE_API_BASE_URL).trim().replace(/\/+$/, '')
}

export function requestRelease(path, request) {
  return new Promise((resolve, reject) => {
    try {
      const platform = request ? null : getPlatform()
      const requestApi = request || (platform && platform.request)
      if (typeof requestApi !== 'function') throw new Error('当前平台未提供 HTTP 请求适配器')
      const baseUrl = getReleaseApiBaseUrl()
      if (!baseUrl) throw new Error('未配置 VITE_RELEASE_API_BASE_URL')
      requestApi.call(platform, {
        url: baseUrl + path,
        method: 'GET',
        timeout: clientConfig.release.requestTimeoutMs,
        success(response) {
          const body = response && response.data
          if (response.statusCode >= 200 && response.statusCode < 300 && body && body.success && body.data) {
            resolve(body.data)
            return
          }
          reject(new Error((body && body.error) || `接口请求失败 (${response.statusCode})`))
        },
        fail(error) {
          reject(new Error((error && (error.errMsg || error.message)) || '接口请求失败'))
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

export function getLatestVersion() {
  return requestRelease('/api/version/latest')
}

export function getLatestAnnouncement() {
  return requestRelease('/api/announcements/latest')
}
