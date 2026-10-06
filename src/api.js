const BASE = import.meta.env.VITE_API_URL ?? ''
const UNIPASS_BASE = (import.meta.env.VITE_UNIPASS_URL ?? 'http://localhost:4000').replace(/\/+$/, '')

const ACCESS_TOKEN_KEY = 'nook_unipass_access_token'
const REFRESH_TOKEN_KEY = 'nook_unipass_refresh_token'
const ROLE_KEY = 'nook_role'
const SETTINGS_CACHE_KEY = 'nook_settings_cache'

let refreshPromise = null

function getToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

function getRole() {
  return localStorage.getItem(ROLE_KEY) || 'member'
}

function decodeTokenPayload(token) {
  try {
    const part = token?.split?.('.')[1]
    if (!part) return null
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

function scopedStorageKey(baseKey) {
  const sub = decodeTokenPayload(getToken())?.sub
  return sub ? `${baseKey}:${sub}` : baseKey
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function getCachedSettings() {
  const scoped = readJsonStorage(scopedStorageKey(SETTINGS_CACHE_KEY), null)
  if (scoped && typeof scoped === 'object' && !Array.isArray(scoped)) return scoped

  // 이전 버전에서 전역 캐시를 쓴 적이 있어도 현재 사용자에게만 scoped key로 승격.
  const legacy = readJsonStorage(SETTINGS_CACHE_KEY, null)
  return legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {}
}

function cacheSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return
  try {
    const key = scopedStorageKey(SETTINGS_CACHE_KEY)
    const next = { ...getCachedSettings(), ...patch }
    localStorage.setItem(key, JSON.stringify(next))
  } catch {}
}

function withQuery(path, params = {}) {
  const q = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value))
  })
  const search = q.toString()
  return search ? `${path}?${search}` : path
}

function setAuthTokens(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

function clearAuthState() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
}

async function logout({ reload = true } = {}) {
  const accessToken = getToken()
  const refreshToken = getRefreshToken()
  clearAuthState()

  if (accessToken && refreshToken) {
    try {
      await fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      })
    } catch {}
  }

  if (reload) window.location.reload()
}

function callbackUrl() {
  return `${window.location.origin}${window.location.pathname}`
}

function startUnipassLogin() {
  const url = new URL('/', UNIPASS_BASE)
  url.searchParams.set('redirect_uri', callbackUrl())
  window.location.href = url.toString()
}

function consumeUnipassCallback() {
  const params = new URLSearchParams(window.location.search)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const error = params.get('error')

  if (!accessToken && !refreshToken && !error) return { handled: false }

  if (accessToken && refreshToken) {
    setAuthTokens(accessToken, refreshToken)
  }

  for (const key of ['access_token', 'refresh_token', 'phone_required', 'error']) {
    params.delete(key)
  }
  const search = params.toString()
  window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}`)

  if (accessToken && refreshToken) return { handled: true, ok: true }
  return { handled: true, ok: false, error: error || 'Unipass 로그인을 완료하지 못했습니다.' }
}

function unipassAccountUrl() {
  const url = new URL('/account', UNIPASS_BASE)
  const accessToken = getToken()
  const refreshToken = getRefreshToken()
  if (accessToken && refreshToken) {
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('refresh_token', refreshToken)
  }
  return url.toString()
}

function openUnipassAccount() {
  window.open(unipassAccountUrl(), '_blank', 'noopener,noreferrer')
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return false
        const data = await res.json()
        if (!data?.accessToken || !data?.refreshToken) return false
        setAuthTokens(data.accessToken, data.refreshToken)
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }

  const ok = await refreshPromise
  if (!ok) clearAuthState()
  return ok
}

const COMMAND_PROFILES = {
  smartthings: { maxConcurrent: 3, refreshDelayMs: 800 },
  xiaomi: { maxConcurrent: 5, refreshDelayMs: 250 },
  builtin: { maxConcurrent: 5, refreshDelayMs: 250 },
  default: { maxConcurrent: 3, refreshDelayMs: 800 },
}

const _commandQueues = new Map() // deviceId -> { active, queue, maxConcurrent }

function commandProfile(provider) {
  return COMMAND_PROFILES[provider] || COMMAND_PROFILES.default
}

function enqueueDeviceCommand(id, task, profile) {
  let entry = _commandQueues.get(id)
  if (!entry) {
    entry = { active: 0, queue: [], maxConcurrent: profile.maxConcurrent }
    _commandQueues.set(id, entry)
  }
  entry.maxConcurrent = profile.maxConcurrent

  return new Promise((resolve, reject) => {
    entry.queue.push({ task, resolve, reject })
    drainDeviceQueue(id)
  })
}

function drainDeviceQueue(id) {
  const entry = _commandQueues.get(id)
  if (!entry) return

  while (entry.active < entry.maxConcurrent && entry.queue.length > 0) {
    const item = entry.queue.shift()
    entry.active += 1
    item.task()
      .then(item.resolve, item.reject)
      .finally(() => {
        entry.active -= 1
        if (entry.active === 0 && entry.queue.length === 0) {
          _commandQueues.delete(id)
          return
        }
        drainDeviceQueue(id)
      })
  }
}

function sendCommandQueued(id, action, params, { provider } = {}) {
  const profile = commandProfile(provider)
  return enqueueDeviceCommand(
    id,
    () => request(`/devices/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ action, ...params }),
    }, { autoLogout: false }),
    profile,
  ).then((result) => {
    setTimeout(() => window.dispatchEvent(new Event('nook:refresh-devices')), profile.refreshDelayMs)
    return result
  })
}

// autoLogout: false이면 401에서 logout 안 하고 에러만 throw
async function request(path, options = {}, { autoLogout = true, retryOnUnauthorized = true } = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (res.status === 401 && retryOnUnauthorized && await refreshAccessToken()) {
    return request(path, options, { autoLogout, retryOnUnauthorized: false })
  }
  if (!res.ok) {
    if (res.status === 401 && autoLogout) {
      await logout()
      return
    }
    const text = await res.text()
    let message = text
    try {
      const parsed = JSON.parse(text)
      message = parsed.detail || parsed.error || text
    } catch {}
    throw new Error(message)
  }
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export const api = {
  // Auth
  startUnipassLogin,
  consumeUnipassCallback,
  unipassAccountUrl,
  openUnipassAccount,
  me: async () => {
    const data = await request('/auth/me')
    if (data?.role) localStorage.setItem(ROLE_KEY, data.role)
    return data
  },

  // Devices
  // /devices 는 모든 기기 status 까지 한 번에 받아오는 합성 응답.
  // /devices/bare 는 status 없는 빠른 리스트, /devices/{id}/info 는 1 기기 status.
  // 프런트는 bare + 병렬 info 호출로 타일별 로딩을 처리.
  getDevices: () => request('/devices'),
  getDevicesBare: () => request('/devices/bare'),
  // info 는 SmartThings 미연결 시 device 객체에 error:'not_connected' 들어감 (200)
  // refresh=true 는 SmartThings refresh capability 를 best-effort 로 호출(지원 디바이스 한정).
  // PTR / 명령 직후처럼 사용자 의도가 강한 fetch 에서만 켜는 게 안전 (rate-limit 절약).
  getDeviceInfo: (id, { refresh = false } = {}) =>
    request(`/devices/${id}/info${refresh ? '?refresh=true' : ''}`, {}, { autoLogout: false }),
  addDevice: (device, { homeId } = {}) =>
    request(withQuery('/devices', { homeId }), { method: 'POST', body: JSON.stringify(device) }),
  removeDevice: (id) =>
    request(`/devices/${id}`, { method: 'DELETE' }),
  updateDevice: (id, patch) =>
    request(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  // 단일 device status/command 는 SmartThings 미연결 시 401 → autoLogout 끔
  getDeviceStatus: (id) =>
    request(`/devices/${id}/status`, {}, { autoLogout: false }),
  sendCommand: (id, action, params = {}, options = {}) => sendCommandQueued(id, action, params, options),
  // 24h 센서 시계열 (공기청정기 등). 백엔드가 1분 주기로 폴링한 sample 들을 반환.
  deviceHistory: (id, hours = 24) =>
    request(`/devices/${id}/history?h=${hours}`, {}, { autoLogout: false }),

  // SmartThings (OAuth 토큰으로 사용자 자신의 카탈로그 조회)
  // 미연결 시 백엔드가 401 반환하므로 autoLogout 끔 (JWT 만료가 아니므로 로그아웃 X)
  getSmartThingsCatalog: ({ homeId } = {}) =>
    request(withQuery('/smartthings/catalog', { homeId }), {}, { autoLogout: false }),

  // SmartThings OAuth (사용자별 계정 연동)
  smartthingsOAuthStart: ({ homeId } = {}) =>
    request(withQuery('/auth/smartthings/start', { homeId }), { method: 'POST' }),
  smartthingsOAuthStatus: ({ homeId } = {}) =>
    request(withQuery('/auth/smartthings/status', { homeId })),
  smartthingsOAuthDisconnect: ({ homeId } = {}) =>
    request(withQuery('/auth/smartthings/disconnect', { homeId }), { method: 'POST' }),

  // Xiaomi Cloud — 다단계 로그인(아이디/비번 → 캡챠 → 이메일 2FA) 후 클라우드 카탈로그 조회.
  // 응답 state: 'need_captcha' | 'need_2fa' | 'ready' | 'failed'.
  // ready 시 catalog 가 함께 옴. 실패는 4xx 가 아니라 200 + state:'failed' 로 옴 (단계 진행에 더 자연스러움).
  xiaomiCloudLogin: (xUsername, xPassword, { homeId } = {}) =>
    request(withQuery('/xiaomi/login', { homeId }), { method: 'POST', body: JSON.stringify({ username: xUsername, password: xPassword }) }, { autoLogout: false }),
  xiaomiCloudCaptcha: (code, { homeId } = {}) =>
    request(withQuery('/xiaomi/captcha', { homeId }), { method: 'POST', body: JSON.stringify({ code }) }, { autoLogout: false }),
  xiaomiCloud2FA: (code, { homeId } = {}) =>
    request(withQuery('/xiaomi/2fa', { homeId }), { method: 'POST', body: JSON.stringify({ code }) }, { autoLogout: false }),
  xiaomiCloudLogout: ({ homeId } = {}) =>
    request(withQuery('/xiaomi/logout', { homeId }), { method: 'POST' }),
  // 저장된 카탈로그 조회 (마지막 fetch 결과)
  xiaomiCloudCatalog: ({ homeId } = {}) =>
    request(withQuery('/xiaomi/catalog', { homeId })),
  // 활성 세션으로 재조회 — 세션 없으면 {state:'needs_login'}
  xiaomiCloudRefresh: ({ homeId } = {}) =>
    request(withQuery('/xiaomi/refresh', { homeId }), { method: 'POST' }, { autoLogout: false }),

  // Homes — physical integrations/devices are shared per home; widgets stay per user.
  homes: () => request('/homes'),
  homeCurrent: () => request('/homes/current'),
  homeSetCurrent: (homeId) =>
    request('/homes/current', { method: 'PUT', body: JSON.stringify({ homeId }) }),
  homeCreate: (home = {}) =>
    request('/homes', { method: 'POST', body: JSON.stringify(home) }),
  homeMembers: ({ homeId } = {}) =>
    request(withQuery('/homes/members', { homeId })),
  homeAddMember: (member, { homeId } = {}) =>
    request(withQuery('/homes/members', { homeId }), { method: 'POST', body: JSON.stringify(member) }),

  // Weather (KMA)
  getWeatherCurrent: () => request('/weather/current'),
  getWeatherForecast: () => request('/weather/forecast'),

  // Scale
  scaleSummary: ({ homeId } = {}) => request(withQuery('/scale/summary', { homeId })),
  scaleHistory: (days = 90, { homeId } = {}) =>
    request(withQuery('/scale/history', { days, homeId })),
  scalePending: ({ homeId } = {}) => request(withQuery('/scale/pending', { homeId })),
  scaleLive: ({ homeId } = {}) =>
    request(withQuery('/scale/live', { homeId, t: Date.now() }), { cache: 'no-store' }),
  scaleClearLive: ({ homeId } = {}) =>
    request(withQuery('/scale/live/clear', { homeId }), { method: 'POST' }),
  scaleClaim: (id, { homeId } = {}) =>
    request(withQuery(`/scale/measurements/${id}/claim`, { homeId }), { method: 'POST' }),
  scaleSaveProfile: (profile, { homeId } = {}) =>
    request(withQuery('/scale/profile', { homeId }), { method: 'POST', body: JSON.stringify(profile) }),
  scaleDevices: ({ homeId } = {}) => request(withQuery('/scale/devices', { homeId })),
  scaleCreateDevice: (device = {}, { homeId } = {}) =>
    request(withQuery('/scale/devices', { homeId }), { method: 'POST', body: JSON.stringify(device) }),
  scaleDeleteDevice: (id, { homeId } = {}) =>
    request(withQuery(`/scale/devices/${encodeURIComponent(id)}`, { homeId }), { method: 'DELETE' }),
  scaleMembers: ({ homeId } = {}) => request(withQuery('/scale/members', { homeId })),
  scaleAddMember: (member, { homeId } = {}) =>
    request(withQuery('/scale/members', { homeId }), { method: 'POST', body: JSON.stringify(member) }),

  // Automations
  getAutomations: () => request('/automations'),
  saveAutomations: (automations) =>
    request('/automations', { method: 'POST', body: JSON.stringify(automations) }),
  runAutomation: (id) =>
    request(`/automations/${id}/run`, { method: 'POST' }, { autoLogout: false }),

  // LLM chat — 자연어 명령. 응답 후 디바이스 동기화 신호 송출.
  llmChat: async (message, history = []) => {
    const res = await request('/llm/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }, { autoLogout: false })
    // 명령이 실행됐으면 메인 화면 디바이스 새로고침을 트리거.
    if (res?.executed?.some?.(e => e?.tool === 'control_device' && e?.ok)) {
      setTimeout(() => window.dispatchEvent(new Event('nook:refresh-devices')), 800)
    }
    return res
  },

  // Settings
  getCachedSettings,
  scopedStorageKey,
  getSettings: async () => {
    const settings = await request('/settings')
    cacheSettingsPatch(settings)
    return settings
  },
  saveSettings: (settings) => {
    cacheSettingsPatch(settings)
    return request('/settings', { method: 'POST', body: JSON.stringify(settings) })
  },

  // Notifications (Web Push)
  notificationsVapidKey: () => request('/notifications/vapid-public-key'),
  notificationsSubscribe: (sub) =>
    request('/notifications/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  notificationsUnsubscribe: (endpoint) =>
    request('/notifications/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  notificationsGetPrefs: () => request('/notifications/prefs'),
  notificationsSavePrefs: (prefs) =>
    request('/notifications/prefs', { method: 'POST', body: JSON.stringify(prefs) }),
  notificationsTest: () =>
    request('/notifications/test', { method: 'POST' }),

  isAuthenticated: () => !!getToken(),
  isAdmin: () => getRole() === 'admin',
  currentRole: getRole,
  logout,
}
