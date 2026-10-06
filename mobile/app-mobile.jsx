import { useState, useEffect, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { PALETTE, IconBolt, IconCloud, IconHome, IconScale, IconSettings, IconSignal, IconSparkle, IconWidgets } from '../components/shared'
import { LoginMobile } from './login-mobile'
import { MainMobile } from './main-mobile'
import { FanMobile } from './fan-mobile'
import { LightMobile } from './light-mobile'
import { BlindMobile } from './blind-mobile'
import { AirPurifierMobile } from './airpurifier-mobile'
import { SettingsMobile } from './settings-mobile'
import { WidgetsMobile } from './connections-mobile'
import { HomesMobile } from './homes-mobile'
import { AutomationsMobile } from './automations-mobile'
import { WeatherMobile } from './weather-mobile'
import { ScaleMobile } from './scale-mobile'
import { ClockMobile } from './clock-mobile'
import { NotificationsMobile } from './notifications-mobile'
import { ChatMobile } from './chat-mobile'
import { usePullToRefresh, PullToRefreshIndicator } from './use-pull-to-refresh'
import { api } from '../src/api.js'

const DEVICE_CACHE_KEY = 'nook_devices_cache'
const ORDER_SETTING_KEYS = ['deviceOrder', 'sceneOrder', 'automationOrder']

function deviceCacheKey() {
  const key = api.scopedStorageKey?.(DEVICE_CACHE_KEY)
  return key && key !== DEVICE_CACHE_KEY ? key : null
}

function stripRuntimeDeviceFields(devices) {
  return devices.map(({ _syncing, _error, ...rest }) => rest)
}

function loadCachedDevices() {
  try {
    const key = deviceCacheKey()
    if (!key) return []
    localStorage.removeItem(DEVICE_CACHE_KEY)
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCachedDevices(devices) {
  try {
    const key = deviceCacheKey()
    localStorage.removeItem(DEVICE_CACHE_KEY)
    if (!key) return
    localStorage.setItem(key, JSON.stringify(stripRuntimeDeviceFields(devices)))
  } catch {}
}

function loadCachedSettings() {
  try {
    const settings = api.getCachedSettings?.()
    return settings && typeof settings === 'object' ? settings : {}
  } catch {
    return {}
  }
}

function hasCachedLayoutSettings(settings = loadCachedSettings()) {
  return ORDER_SETTING_KEYS.some(key => Array.isArray(settings[key]))
}

function cachedOrderState(settings) {
  const next = {}
  for (const key of ORDER_SETTING_KEYS) {
    if (Array.isArray(settings[key])) next[key] = settings[key]
  }
  return next
}

function cachedTweaks(settings) {
  const next = {}
  if (typeof settings.accent === 'string') next.accent = settings.accent
  if (typeof settings.radius === 'number') next.radius = settings.radius
  if (typeof settings.loading === 'string') next.loading = settings.loading
  if (typeof settings.mainLayout === 'string') next.mainLayout = settings.mainLayout
  return next
}

const CACHED_SETTINGS = loadCachedSettings()

const INITIAL_STATE = {
  fan:    { power: false, speed: 50, osc: false, angle: 90 },
  light:  { power: false },
  scene:  null,
  devices: loadCachedDevices(),
  automations: [],
  ...cachedOrderState(CACHED_SETTINGS),
}

const TWEAK_DEFAULTS = { accent: '#e8a23c', radius: 14, loading: 'spinner', mainLayout: 'free', ...cachedTweaks(CACHED_SETTINGS) }

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(query).matches
  ))

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [query])

  return matches
}

function AppMobile() {
  const [isAuth, setIsAuth]     = useState(api.isAuthenticated())
  const [screen, setScreen]     = useState('main')
  const [devicesLoading, setDevicesLoading] = useState(api.isAuthenticated())
  const [state, setState]       = useState(INITIAL_STATE)
  const [tweaks, setTweaks]     = useState(TWEAK_DEFAULTS)
  const [settingsReady, setSettingsReady] = useState(!api.isAuthenticated() || hasCachedLayoutSettings(CACHED_SETTINGS))
  const [editMode, setEditMode] = useState(false)
  const [toast, setToast]       = useState(null)
  const [loginError, setLoginError] = useState('')
  const [refreshKey, setRefresh] = useState(0)
  const pollingRef              = useRef(null)
  const loadDevicesInFlightRef  = useRef(null)
  const loadDevicesPendingRef   = useRef(null)
  const wideLayout = useMediaQuery('(min-width: 720px)')
  const desktopNav = useMediaQuery('(min-width: 1024px)')
  const insightPanel = useMediaQuery('(min-width: 1180px)')

  // ── iOS Safari 스타일 페이지 트랜지션 ──────────────────────────
  // nav: null (정적) | { kind: 'pop'|'push', otherRoute }.
  //   - 'pop'  = 자식 → 부모로 나감 (현재가 우측으로 밀려나고, otherRoute 가
  //              좌측 -30% 패럴랙스 위치에서 0 으로 복귀). 스와이프-백 트래킹
  //              중에도 같은 레이아웃을 사용하므로 kind='pop' 으로 통일.
  //   - 'push' = 부모 → 자식으로 들어감 (otherRoute 가 우측 100% 에서 0 으로
  //              들어오고, 현재는 좌측 -30% 로 dim 과 함께 후퇴).
  // 한 트랜지션이 끝나기 전 다른 트랜지션이 시작되면 안 되니 animLockRef 로
  // 가드. 스와이프 트래킹 중엔 lock 안 걸고, 릴리즈 애니메이션 동안만 lock.
  const [nav, setNav] = useState(null)
  const currentLayerRef = useRef(null)
  const otherLayerRef = useRef(null)
  const dimRef = useRef(null)
  const animLockRef = useRef(false)

  // 네비게이션 히스토리 스택. forward 할 때 직전 screen 을 push, back 할 때
  // pop. 이렇게 해야 "어디서 왔는가"가 정확함 — 같은 화면이 여러 부모에서
  // 진입 가능 (예: automations 는 main 과 settings 양쪽에서 옴) 해도 직전
  // 페이지로 돌아감. 정적 hierarchy 매핑은 단일 부모 가정이라 부정확.
  const backStackRef = useRef([])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }, [])

  useEffect(() => {
    const result = api.consumeUnipassCallback()
    if (!result.handled) return

    if (result.ok) {
      setLoginError('')
      setIsAuth(true)
      setDevicesLoading(true)
      setSettingsReady(hasCachedLayoutSettings())
      api.me().catch(() => {})
      return
    }

    setLoginError(result.error || 'Unipass 로그인을 완료하지 못했습니다.')
    setIsAuth(false)
  }, [])

  useEffect(() => {
    if (!isAuth) return
    api.me().catch(() => {})
  }, [isAuth])

  // ── 기기 목록 + 상태 로드 ──────────────────────────────────────
  // 두 단계: (1) bare 리스트로 타일을 즉시 렌더, (2) 각 기기의 info 를 병렬로
  // 받아서 도착하는대로 타일별로 갱신. 동기화 실패한 기기만 _error 가 셋되고
  // 그 박스 안에서 오프라인 표시되어, 다른 기기 로딩과 분리된다.
  // silent: true (10s 백그라운드 폴링) 인 경우 _syncing 스피너는 안 띄움.
  const loadDevices = useCallback(async ({ silent = false } = {}) => {
    const current = loadDevicesInFlightRef.current
    if (current) {
      if (!silent && current.silent) loadDevicesPendingRef.current = { silent: false }
      return current.promise
    }

    const run = (async () => {
      if (!silent) setDevicesLoading(true)
      let bare
      try {
        bare = await api.getDevicesBare()
      } catch {
        if (!silent) setDevicesLoading(false)
        return
      }

      // (1) 타일 골격을 즉시 반영. bare 응답은 state.json 의 stored 정의(=저장 당시의
      //     power 등)이므로, 기존 live state(power/sub/fanStatus/...)를 우선 보존한다.
      //     bare 의 power=false 가 갱신해둔 power=true 를 덮어쓰면 /info 가 돌아오는
      //     사이 모든 기기 타일이 OFF 로 깜빡이거나 (silent 호출에선) info 도착 전까지
      //     OFF 로 보이는 문제가 있었다.
              setState(prev => {
                const prevById = new Map(prev.devices.map(d => [d.id, d]))
                const next = bare.map(b => {
                  const existing = prevById.get(b.id)
                  if (!existing) {
                    // 새로 추가된 기기 — bare 가 그대로 초기 상태.
                    return { ...b, _syncing: !silent, _error: null }
                  }
                  // 기존 기기는 metadata(label/iconKey/screen/...) 만 bare 에서 받고,
                  // 라이브 상태는 그대로 유지. /info 가 도착하면 모두 갱신된다.
                  return {
                    ...existing,
                    // bare 에 있는 변경된 metadata 만 명시적으로 흡수
                    label: b.label ?? existing.label,
                    iconKey: b.iconKey ?? existing.iconKey,
                    screen: b.screen ?? existing.screen,
                    type: b.type ?? existing.type,
                    provider: b.provider ?? existing.provider,
                    _syncing: silent ? !!existing._syncing : true,
                    _error: silent ? existing._error || null : null,
                  }
                })
                saveCachedDevices(next)
                return { ...prev, devices: next }
              })

      // bare 목록을 받으면 전체 화면 로딩은 끝낸다. 이후 느린 클라우드 조회는
      // 타일별 _syncing 으로만 표시해서 Xiaomi 한 대가 전체 UI를 붙잡지 않게 한다.
      if (!silent) setDevicesLoading(false)

      // (2) 병렬 fetch — 도착 순서대로 해당 타일만 갱신.
      // loud refresh (silent=false) 에선 SmartThings refresh capability 를 함께 요청해서
      // 클라우드 cache 를 강제로 갱신 (지원 디바이스 한정). silent polling 에선 rate-limit
      // 보호 차원에서 안 보냄.
      const inflight = bare.map(async (b) => {
        try {
          const info = await api.getDeviceInfo(b.id, { refresh: !silent })
          setState(prev => {
            const next = prev.devices.map(d => {
              if (d.id !== b.id) return d
              const merged = { ...d, ...info, _syncing: false, _error: info?.error || null }
              // 옵티미스틱 윈도우 — cloud timestamp 가 명령 전(_preCommandTs)에서
              // 진전됐으면 cloud 가 새 상태를 보고한 것이므로 그걸 신뢰. 진전 안
              // 됐으면 cloud 가 stale (또는 디바이스 driver 가 push 를 안 함) 이라
              // 우리 의도값 유지. 30초 hard cap 도 있어서 영구 hang 방지.
              const within = d._optimisticUntil && Date.now() < d._optimisticUntil
              if (within && d._optimisticPower !== undefined) {
                const preTs = d._preCommandTs || 0
                const cloudTs = info?.powerTimestamp || 0
                // baseline 이 없으면(preTs=0) cloud 진전 여부를 알 수 없으니
                // 윈도우 만료 전까지는 항상 optimistic 을 신뢰.
                const cloudAdvanced = preTs > 0 && cloudTs > preTs
                if (cloudAdvanced) {
                  // cloud 가 새 값을 보고함 — 마커 해제, info 그대로 신뢰.
                  merged._optimisticPower = undefined
                  merged._optimisticUntil = undefined
                  merged._preCommandTs = undefined
                } else {
                  // cloud 는 아직 명령 전 상태 그대로 — 우리 의도값 신뢰.
                  merged.power = d._optimisticPower
                  merged._optimisticPower = d._optimisticPower
                  merged._optimisticUntil = d._optimisticUntil
                  merged._preCommandTs = d._preCommandTs
                }
              } else {
                merged._optimisticPower = undefined
                merged._optimisticUntil = undefined
                merged._preCommandTs = undefined
              }
              return merged
            })
            // legacy state.fan 슬롯도 builtin-fan 결과 따라 동기화 (기존 동작 유지).
            let fan = prev.fan
            if (b.id === 'builtin-fan' && info?.fanStatus) {
              const s = info.fanStatus
              fan = { power: !!s.power, speed: s.speed ?? prev.fan.speed, osc: !!s.oscillation, angle: s.angle ?? prev.fan.angle }
            }
            // 캐시에 _syncing/_error 만 strip. _optimisticPower / _optimisticUntil /
            // _preCommandTs 는 일부러 보존해서 페이지 reload 후에도 사용자 의도값이
            // 토글에 유지되도록 한다. 만료된 마커는 다음 merge 에서 자동 정리.
                    saveCachedDevices(next)
                    return { ...prev, devices: next, fan }
                  })
        } catch (e) {
          setState(prev => ({
            ...prev,
            devices: prev.devices.map(d => d.id === b.id
              ? { ...d, _syncing: false, _error: e?.message || '동기화 실패' }
              : d),
          }))
        }
      })

      await Promise.allSettled(inflight)
    })()

    const entry = { promise: null, silent }
    entry.promise = run.finally(() => {
      if (loadDevicesInFlightRef.current === entry) loadDevicesInFlightRef.current = null
      const pending = loadDevicesPendingRef.current
      loadDevicesPendingRef.current = null
      if (pending) return loadDevices(pending)
    })
    loadDevicesInFlightRef.current = entry
    return entry.promise
  }, [])

  // ── 초기 로드 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuth) return
    setSettingsReady(hasCachedLayoutSettings())
    const settingsPromise = api.getSettings().then(s => {
      if (!s) return
      // tweak 키 (외관 설정)
      setTweaks(prev => {
        const next = { ...prev }
        for (const k of ['accent', 'radius', 'loading']) {
          if (s[k] !== undefined) next[k] = s[k]
        }
        return next
      })
      // 카드 정렬 순서 복원
      setState(prev => {
        const next = { ...prev }
        let changed = false
        for (const k of ['deviceOrder', 'sceneOrder', 'automationOrder']) {
          if (Array.isArray(s[k])) { next[k] = s[k]; changed = true }
        }
        return changed ? next : prev
      })
    }).catch(() => {})
      .finally(() => setSettingsReady(true))
    api.getAutomations().then(a => {
      if (Array.isArray(a)) setState(prev => ({ ...prev, automations: a }))
    }).catch(() => {})
    loadDevices()
  }, [isAuth, refreshKey, loadDevices])

  // ── 10초 polling ──────────────────────────────────────────────
  useEffect(() => {
    if (!isAuth) return
    pollingRef.current = setInterval(() => loadDevices({ silent: true }), 10_000)
    return () => clearInterval(pollingRef.current)
  }, [isAuth, loadDevices])

  // ── 화면 깨어날 때 즉시 동기화 (백그라운드 후 visibility / focus 회복) ───
  useEffect(() => {
    if (!isAuth) return
    const onWake = () => {
      if (document.visibilityState === 'visible') {
        loadDevices({ silent: true })
      }
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    window.addEventListener('pageshow', onWake)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('pageshow', onWake)
    }
  }, [isAuth, loadDevices])

  // ── 디바이스 상세 페이지(fan/light/blind) 진입 시 즉시 동기화 ─────
  useEffect(() => {
    if (!isAuth) return
    const root = screen.split(':')[0]
    if (['fan', 'light', 'blind'].includes(root)) {
      loadDevices({ silent: true })
    }
  }, [isAuth, screen, loadDevices])

  // ── api.sendCommand 가 보내는 새로고침 신호 listen ────────────────
  useEffect(() => {
    if (!isAuth) return
    const onRefresh = () => loadDevices({ silent: true })
    window.addEventListener('nook:refresh-devices', onRefresh)
    return () => window.removeEventListener('nook:refresh-devices', onRefresh)
  }, [isAuth, loadDevices])

  // ── SmartThings OAuth 콜백 결과 토스트 (?st=connected | error) ─
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const st = params.get('st')
    if (!st) return
    if (st === 'connected') showToast('SmartThings 연결됨')
    else if (st === 'error') showToast('SmartThings 연결 실패')
    params.delete('st')
    const newSearch = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? '?' + newSearch : ''))
  }, [showToast])

  // ── 알림 클릭 → 화면 이동 ─────────────────────────────────────
  // (a) 새 창으로 열린 경우: ?goto=weather 쿼리스트링을 부팅 시 한 번 읽음.
  // (b) 이미 떠있던 클라이언트로 포커스가 돌아온 경우: SW 가 postMessage 로
  //     navigate 명령을 보냄 → 그걸 받아 setScreen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const goto = params.get('goto')
    if (goto && ['main','weather','scale','settings','notifications','automations','connections','widgets','homes']
                .includes(goto)) {
      setScreen(goto)
      params.delete('goto')
      const q = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (q ? '?' + q : ''))
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e) => {
      const d = e.data
      if (!d || d.type !== 'nook:navigate') return
      try {
        const u = new URL(d.url, window.location.origin)
        const target = u.searchParams.get('goto')
        if (target) setScreen(target)
      } catch {}
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  // ── edit mode 메시지 ──────────────────────────────────────────
  useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== 'object') return
      if (e.data.type === '__activate_edit_mode')   setEditMode(true)
      if (e.data.type === '__deactivate_edit_mode') setEditMode(false)
    }
    window.addEventListener('message', onMsg)
    window.parent.postMessage({ type: '__edit_mode_available' }, '*')
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const NAV_DURATION_MS = 320
  const NAV_SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)'

  // 트랜지션 종료: setScreen 직전에 transform 을 절대 0 으로 되돌리지 않음
  // (한 프레임 동안 옛 콘텐츠가 가운데 보여 깜빡임). flushSync 로 동기 렌더해
  // current 가 새 콘텐츠를 표시한 다음 transform 을 초기화하고 other 레이어
  // unmount.
  const finishNav = (toRoute) => {
    flushSync(() => setScreen(toRoute))
    if (currentLayerRef.current) {
      currentLayerRef.current.style.transition = ''
      currentLayerRef.current.style.transform = ''
    }
    setNav(null)
    animLockRef.current = false
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const animateNav = (kind, toRoute) => {
    if (animLockRef.current) return
    animLockRef.current = true
    setNav({ kind, otherRoute: toRoute })
    // 두 번의 rAF: (1) React 가 layer 를 mount + 초기 transform 으로 paint,
    // (2) animation 적용. 한 tick 안에서 transform 을 두 번 바꾸면 브라우저가
    // 보간 없이 final 값으로 점프함.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const w = window.innerWidth
        const cur = currentLayerRef.current
        const other = otherLayerRef.current
        const dim = dimRef.current
        if (kind === 'push') {
          if (cur) {
            cur.style.transition = `transform ${NAV_DURATION_MS}ms ${NAV_SPRING}`
            cur.style.transform = `translateX(${-w * 0.3}px)`
          }
          if (other) {
            other.style.transition = `transform ${NAV_DURATION_MS}ms ${NAV_SPRING}`
            other.style.transform = 'translateX(0)'
          }
          if (dim) {
            dim.style.transition = `opacity ${NAV_DURATION_MS}ms ease-out`
            dim.style.opacity = '0.35'
          }
        } else {  // pop
          if (cur) {
            cur.style.transition = `transform ${NAV_DURATION_MS}ms ${NAV_SPRING}`
            cur.style.transform = `translateX(${w}px)`
          }
          if (other) {
            other.style.transition = `transform ${NAV_DURATION_MS}ms ${NAV_SPRING}`
            other.style.transform = 'translateX(0)'
          }
          if (dim) {
            dim.style.transition = `opacity ${NAV_DURATION_MS}ms ease-out`
            dim.style.opacity = '0'
          }
        }
      })
    })
    setTimeout(() => finishNav(toRoute), NAV_DURATION_MS + 30)
  }

  // 네비게이션 시 호출. 스택을 검사해서:
  //   - 타겟이 스택에 있으면 → 거기까지 truncate 하고 pop 애니메이션 (예:
  //     깊은 곳에서 'main' 호출하면 스택 비우고 main 까지 한 번에 pop).
  //   - 없으면 → 현재 화면을 스택에 push 하고 push 애니메이션.
  const go = (s) => {
    if (s === screen) return
    if (animLockRef.current) return
    if (wideLayout) {
      backStackRef.current.push(screen)
      setScreen(s)
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    const stackIdx = backStackRef.current.indexOf(s)
    if (stackIdx >= 0) {
      backStackRef.current.length = stackIdx
      animateNav('pop', s)
    } else {
      backStackRef.current.push(screen)
      animateNav('push', s)
    }
  }

  // 헤더 백 버튼 / 스와이프-백 commit 시 호출. 스택의 top 을 pop 해서 거기로
  // 이동. 스택이 비었으면 'main' 으로 fallback.
  const goBack = () => {
    if (animLockRef.current) return
    const prev = backStackRef.current.pop()
    if (wideLayout) {
      setScreen(prev || 'main')
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    if (prev) {
      animateNav('pop', prev)
    } else if (screen !== 'main') {
      animateNav('pop', 'main')
    }
  }

  // ── 좌측 엣지 스와이프 → 뒤로가기 (iOS Safari 스타일) ─────────
  // 트래킹 중엔 손가락 따라 현재 레이어가 오른쪽으로 밀리고 이전 라우트가 좌측
  // 에서 패럴랙스로 피크. 임계 못 넘기면 스프링으로 복귀, 넘기면 pop 트랜지션
  // 으로 setScreen. 백스택이 비어 있으면 비활성.
  useEffect(() => {
    if (backStackRef.current.length === 0) return

    const EDGE = 24
    const COMMIT_RATIO = 0.4
    const VELOCITY_COMMIT = 0.5

    let phase = 'idle'                // idle | detecting | tracking | locked-vertical | releasing
    let startX = 0, startY = 0
    let lastX = 0, lastT = 0
    let dx = 0, vx = 0
    let prevRouteCached = null

    const apply = (curX) => {
      const w = window.innerWidth
      if (currentLayerRef.current) {
        currentLayerRef.current.style.transition = 'none'
        currentLayerRef.current.style.transform = `translateX(${curX}px)`
      }
      if (otherLayerRef.current) {
        otherLayerRef.current.style.transition = 'none'
        otherLayerRef.current.style.transform = `translateX(${-w * 0.3 + curX * 0.3}px)`
      }
      if (dimRef.current) {
        const t = Math.max(0, Math.min(1, 1 - curX / w))
        dimRef.current.style.transition = 'none'
        dimRef.current.style.opacity = String(0.35 * t)
      }
    }

    const release = (commit) => {
      phase = 'releasing'
      animLockRef.current = true
      const w = window.innerWidth
      const target = commit ? w : 0
      if (currentLayerRef.current) {
        currentLayerRef.current.style.transition = `transform ${NAV_DURATION_MS}ms ${NAV_SPRING}`
        currentLayerRef.current.style.transform = `translateX(${target}px)`
      }
      if (otherLayerRef.current) {
        otherLayerRef.current.style.transition = `transform ${NAV_DURATION_MS}ms ${NAV_SPRING}`
        otherLayerRef.current.style.transform = `translateX(${commit ? 0 : -w * 0.3}px)`
      }
      if (dimRef.current) {
        dimRef.current.style.transition = `opacity ${NAV_DURATION_MS}ms ease-out`
        dimRef.current.style.opacity = String(commit ? 0 : 0.35)
      }
      setTimeout(() => {
        if (commit && prevRouteCached) {
          // 스와이프-백 커밋도 백스택 pop. 뒤로가기 버튼과 동일한 의미.
          backStackRef.current.pop()
          finishNav(prevRouteCached)
        } else {
          if (currentLayerRef.current) {
            currentLayerRef.current.style.transition = ''
            currentLayerRef.current.style.transform = ''
          }
          setNav(null)
          animLockRef.current = false
        }
        phase = 'idle'
      }, NAV_DURATION_MS + 20)
    }

    const onStart = (e) => {
      if (phase !== 'idle') return
      if (animLockRef.current) return
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX >= EDGE) return
      startX = t.clientX; startY = t.clientY
      lastX = t.clientX;  lastT = e.timeStamp
      dx = 0; vx = 0
      phase = 'detecting'
    }

    const onMove = (e) => {
      if (phase === 'idle' || phase === 'locked-vertical' || phase === 'releasing') return
      if (e.touches.length !== 1) {
        if (phase === 'tracking') release(false)
        else phase = 'idle'
        return
      }
      const t = e.touches[0]
      const cdx = t.clientX - startX
      const cdy = Math.abs(t.clientY - startY)

      if (phase === 'detecting') {
        if (Math.abs(cdx) < 8 && cdy < 8) return
        if (cdx > cdy * 1.4 && cdx > 0) {
          // 스택 top 이 prev. 비어있으면 swipe-back 비활성 (위 효과 가드).
          prevRouteCached = backStackRef.current[backStackRef.current.length - 1]
          if (!prevRouteCached) {
            phase = 'locked-vertical'
            return
          }
          phase = 'tracking'
          setNav({ kind: 'pop', otherRoute: prevRouteCached })
        } else {
          phase = 'locked-vertical'
          return
        }
      }

      const now = e.timeStamp
      const dt = now - lastT
      if (dt > 0) vx = (t.clientX - lastX) / dt
      lastX = t.clientX; lastT = now
      dx = Math.max(0, cdx)
      e.preventDefault()
      apply(dx)
    }

    const onEnd = () => {
      if (phase === 'tracking') {
        const w = window.innerWidth
        release(dx > w * COMMIT_RATIO || vx > VELOCITY_COMMIT)
      } else if (phase !== 'releasing') {
        phase = 'idle'
      }
    }

    window.addEventListener('touchstart', onStart,  { passive: true })
    window.addEventListener('touchmove',  onMove,   { passive: false })
    window.addEventListener('touchend',   onEnd,    { passive: true })
    window.addEventListener('touchcancel', onEnd,   { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('touchend',   onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [screen])

  const updateTweaks = (patch) => {
    setTweaks(prev => {
      const next = { ...prev, ...patch }
      api.saveSettings(patch).catch(() => {})
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*')
      return next
    })
  }

  // ── 자동화 실행 (button 트리거, 낙관적 + API) ─────────────────────
  const runAutomation = useCallback(async (id) => {
    const a = state.automations.find(x => x.id === id)
    if (!a) return
    // 낙관적 UI: 디바이스 power 즉시 반영
    setState(prev => {
      const devices = prev.devices.map(d => {
        const act = (a.actions || []).find(x => x.deviceId === d.id)
        return act ? { ...d, power: act.action === 'on' } : d
      })
      return { ...prev, devices }
    })
    showToast(a.name + ' · 실행')
    // 백엔드에서 실제 디바이스 명령
    try {
      const res = await api.runAutomation(id)
      if (res?.ok_count != null && res.ok_count < res.total) {
        showToast(`${a.name} · ${res.ok_count}/${res.total} 성공`)
      }
      // 짧게 후 device 상태 동기화
      setTimeout(() => loadDevices({ silent: true }), 800)
    } catch (e) {
      showToast(`${a.name} · 실패: ${e?.message || ''}`)
    }
  }, [state.automations, showToast, loadDevices])

  // ── 기기 삭제 (edit 모드 X 버튼) ──────────────────────────────
          const removeDevice = useCallback(async (deviceId) => {
            // 낙관적 제거. 실패 시 다음 loadDevices 가 복구해줌.
            setState(prev => {
              const nextDevices = prev.devices.filter(d => d.id !== deviceId)
              saveCachedDevices(nextDevices)
              return { ...prev, devices: nextDevices }
            })
    try {
      await api.removeDevice(deviceId)
      showToast('기기를 제거했습니다')
    } catch (e) {
      showToast('제거 실패: ' + (e?.message || ''))
      setRefresh(k => k + 1)
    }
  }, [showToast])

  // ── 기기 토글 (낙관적 + API) ──────────────────────────────────
  // SmartThings 는 명령 후 cloud 가 새 상태를 보고할 때까지 1~3초 (정상 디바이스),
  // 또는 영원히 (드라이버 깨진 디바이스 — 명령은 ACCEPT 되지만 timestamp 가 안
  // 움직임) 걸린다. 그래서 단순 시간 만료 대신, 명령 직전의 cloud timestamp 를
  // 스냅샷해서 _preCommandTs 에 저장하고, /info 가 새 timestamp 를 들고 와야만
  // 클라우드를 신뢰한다. cloud 가 stale 한 동안엔 사용자 의도값을 유지.
  // 정상 디바이스는 cloud 가 보통 1~3초 안에 따라잡아서 마커가 즉시 해제됨.
  // 클라우드가 깨진 디바이스(timestamp frozen)는 hard cap 만큼 사용자 의도값을
  // 유지함 — 5분이면 사용자가 잊고 다시 탭하기 충분, 무한 hang 도 방지.
  const OPTIMISTIC_MAX_MS = 5 * 60 * 1000
  const toggleDevice = useCallback(async (deviceId, currentPower, provider) => {
    const action = currentPower ? 'off' : 'on'
    const intended = !currentPower
    const expiry = Date.now() + OPTIMISTIC_MAX_MS
    setState(prev => {
      const dev = prev.devices.find(d => d.id === deviceId)
      const preTs = dev?.powerTimestamp || 0
      const nextDevices = prev.devices.map(d => d.id === deviceId
        ? { ...d, power: intended,
            _optimisticPower: intended, _optimisticUntil: expiry, _preCommandTs: preTs }
        : d)
      // 옵티미스틱 마커 포함해서 즉시 캐시에 저장. 사용자가 탭 직후 곧바로
      // 페이지 리로드를 해도 마커가 살아남아야 reload 후 /info 가 stale 한
      // cloud 값을 들고와도 토글이 의도값을 유지함.
              saveCachedDevices(nextDevices)
              return { ...prev, devices: nextDevices }
            })
    try {
      await api.sendCommand(deviceId, action, {}, { provider })
    } catch (e) {
      setState(prev => {
        const nextDevices = prev.devices.map(d => d.id === deviceId
          ? { ...d, power: currentPower,
              _optimisticPower: undefined, _optimisticUntil: undefined, _preCommandTs: undefined }
          : d)
                saveCachedDevices(nextDevices)
                return { ...prev, devices: nextDevices }
              })
      showToast('명령 실패')
    }
  }, [showToast])

  // ── 자동화 저장 ────────────────────────────────────────────────
  const saveAutomations = useCallback((automations) => {
    setState(prev => ({ ...prev, automations }))
    api.saveAutomations(automations).catch(() => showToast('저장 실패'))
  }, [showToast])

  // ── Pull to refresh (main / 디바이스 컨트롤 화면에서만 활성) ────
  const ptrEnabled = isAuth && ['main', 'fan', 'light', 'blind', 'weather', 'scale'].includes(screen.split(':')[0])
  const ptr = usePullToRefresh(loadDevices, { enabled: ptrEnabled })

  if (!isAuth) {
    return <LoginMobile error={loginError} />
  }

  // 한 라우트를 JSX 로 변환 — gesture 프리뷰 레이어가 같은 함수로 prev 라우트
  // 를 동시에 그릴 수 있게 분리. 각 화면의 back 핸들러는 라우트와 무관하게
  // 부모로 이동(go 호출)하므로 prev 렌더에 그대로 써도 안전.
  const renderRoute = (route) => {
    const parts = route.split(':')
    const root = parts[0]
    const extra = parts[1]
    switch (root) {
      case 'main':
        return <MainMobile state={state} setState={setState} go={go} tweaks={tweaks}
                 runAutomation={runAutomation} onToggleDevice={toggleDevice}
                 onRemoveDevice={removeDevice}
                 onSaveAutomations={saveAutomations}
                 devicesLoading={devicesLoading}
                 layoutReady={settingsReady}
                 desktopShell={desktopNav}/>
      case 'fan': {
        const dev = state.devices.find(d => d.id === extra) || state.devices.find(d => d.iconKey === 'fan')
        return <FanMobile state={state} setState={setState} back={goBack} tweaks={tweaks}
                 deviceId={dev?.id} onShowToast={showToast}/>
      }
      case 'light': {
        const dev = state.devices.find(d => d.id === extra) || state.devices.find(d => d.iconKey === 'bulb')
        return <LightMobile state={state} setState={setState} back={goBack} tweaks={tweaks}
                 deviceId={dev?.id} stDeviceId={dev?.stDeviceId} onShowToast={showToast}/>
      }
      case 'blind': {
        const dev = state.devices.find(d => d.id === extra) || state.devices.find(d => d.iconKey === 'blind')
        return <BlindMobile state={state} setState={setState} back={goBack} tweaks={tweaks}
                 deviceId={dev?.id} onShowToast={showToast}/>
      }
      case 'airpurifier': {
        const dev = state.devices.find(d => d.id === extra) || state.devices.find(d => d.iconKey === 'wind')
        return <AirPurifierMobile state={state} back={goBack} tweaks={tweaks}
                 deviceId={dev?.id} onShowToast={showToast}/>
      }
      case 'settings':
        return <SettingsMobile tweaks={tweaks} onChange={updateTweaks} back={goBack} go={go}/>
      case 'connections':  // legacy redirect
      case 'widgets':
        return <WidgetsMobile route={route} state={state} setState={setState}
                 back={goBack} go={go} tweaks={tweaks}
                 onDeviceAdded={() => setRefresh(k => k + 1)}
                 onDeviceRemoved={() => setRefresh(k => k + 1)}/>
      case 'homes':
        return <HomesMobile route={route} back={goBack} go={go}
                 accent={tweaks.accent} r={tweaks.radius}/>
      case 'automations':
        return <AutomationsMobile route={route} state={state} setState={setState}
                 back={goBack} go={go} tweaks={tweaks}
                 onSave={saveAutomations}/>
      case 'weather': {
        const weatherDevice = state.devices.find(d => d.iconKey === 'cloud' && d.weather)
        return <WeatherMobile back={goBack} tweaks={tweaks} initialCurrent={weatherDevice?.weather || null}/>
      }
      case 'scale': {
        const mode = parts[1] === 'settings' || parts[2] === 'settings' ? 'settings' : 'dashboard'
        const scaleDeviceId = parts[1] === 'settings' ? null : extra
        const dev = state.devices.find(d => d.id === scaleDeviceId) || state.devices.find(d => d.iconKey === 'scale')
        return <ScaleMobile back={goBack} go={go} tweaks={tweaks} mode={mode}
                 deviceId={dev?.id} homeId={dev?.homeId} homeName={dev?.homeName}/>
      }
      case 'clock':
        return <ClockMobile back={goBack} tweaks={tweaks}/>
      case 'notifications':
        return <NotificationsMobile back={goBack} tweaks={tweaks}/>
      case 'chat':
        return <ChatMobile back={goBack} tweaks={tweaks}/>
      default: return null
    }
  }

  const current = renderRoute(screen)
  const goRoot = (route) => {
    if (route === screen) return
    if (animLockRef.current) return
    backStackRef.current = []
    setScreen(route)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  if (wideLayout) {
    return (
      <>
        <ResponsiveShell
          screen={screen}
          state={state}
          tweaks={tweaks}
          desktopNav={desktopNav}
          insightPanel={insightPanel}
          go={goRoot}
        >
          {current}
        </ResponsiveShell>
        {ptrEnabled && <PullToRefreshIndicator pull={ptr.pull} refreshing={ptr.refreshing} threshold={ptr.threshold} accent={tweaks.accent}/>}
        {toast && <Toast text={toast} accent={tweaks.accent}/>}
        {editMode && <TweaksPanelM tweaks={tweaks} onChange={updateTweaks}/>}
      </>
    )
  }

  // pop: otherLayer 가 아래(z=1)에서 좌측 -30% 패럴랙스로 피크. dim 은
  //      otherLayer 안에 두어 새 콘텐츠 위에 덮임 (점점 옅어짐 0.35→0).
  // push: otherLayer 가 위(z=3)에서 우측 100% 부터 들어옴. dim 은 currentLayer
  //      안에 두어 옛 콘텐츠 위에 덮임 (점점 진해짐 0→0.35).
  const isPop = nav?.kind === 'pop'
  const isPush = nav?.kind === 'push'

  return (
    <>
      {isPop && (
        <div ref={otherLayerRef} style={{
          position: 'fixed', inset: 0, zIndex: 1,
          background: PALETTE.charcoal.bg,
          overflow: 'hidden',
          transform: 'translateX(-30%)',
          willChange: 'transform',
          pointerEvents: 'none',
        }}>
          <div style={{
            minHeight: '100vh',
            background: PALETTE.charcoal.bg,
            color: PALETTE.charcoal.text,
          }}>
            {renderRoute(nav.otherRoute)}
          </div>
          <div ref={dimRef} style={{
            position: 'absolute', inset: 0,
            background: '#000', opacity: 0.35,
            pointerEvents: 'none',
          }}/>
        </div>
      )}
      <div ref={currentLayerRef} style={{
        position: 'relative', zIndex: 2,
        minHeight: '100vh',
        background: PALETTE.charcoal.bg,
        color: PALETTE.charcoal.text,
        paddingBottom: 'env(safe-area-inset-bottom)',
        willChange: nav ? 'transform' : 'auto',
        boxShadow: nav ? '-12px 0 32px rgba(0,0,0,0.45)' : 'none',
      }}>
        {current}
        {isPush && (
          <div ref={dimRef} style={{
            position: 'absolute', inset: 0,
            background: '#000', opacity: 0,
            pointerEvents: 'none',
          }}/>
        )}
      </div>
      {isPush && (
        <div ref={otherLayerRef} style={{
          position: 'fixed', inset: 0, zIndex: 3,
          background: PALETTE.charcoal.bg,
          overflow: 'hidden',
          transform: 'translateX(100%)',
          willChange: 'transform',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }}>
          <div style={{
            minHeight: '100vh',
            background: PALETTE.charcoal.bg,
            color: PALETTE.charcoal.text,
          }}>
            {renderRoute(nav.otherRoute)}
          </div>
        </div>
      )}
      {ptrEnabled && <PullToRefreshIndicator pull={ptr.pull} refreshing={ptr.refreshing} threshold={ptr.threshold} accent={tweaks.accent}/>}
      {toast && <Toast text={toast} accent={tweaks.accent}/>}
      {editMode && <TweaksPanelM tweaks={tweaks} onChange={updateTweaks}/>}
    </>
  )
}

function ResponsiveShell({ children, screen, state, tweaks, desktopNav, insightPanel, go }) {
  const accent = tweaks.accent
  const root = screen.split(':')[0]
  const devices = state.devices || []
  const automations = state.automations || []
  const weather = devices.find(d => d.iconKey === 'cloud' && d.weather)?.weather
  const scaleDevice = devices.find(d => d.iconKey === 'scale')
  const onCount = devices.filter(d => {
    if (d.provider === 'widgets') return false
    return !!d.power
  }).length
  const deviceCount = devices.filter(d => d.provider !== 'widgets').length
  const activeAutomations = automations.filter(a => a.enabled).length

  const contentWidth = desktopNav ? 560 : 640
  const columns = desktopNav
    ? `${desktopNav ? '220px ' : ''}minmax(0, ${contentWidth}px)${insightPanel ? ' 316px' : ''}`
    : `minmax(0, ${contentWidth}px)`

  return (
    <div style={{
      minHeight: '100vh',
      background: PALETTE.charcoal.bg,
      color: PALETTE.charcoal.text,
      padding: desktopNav ? '24px' : '0 20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: desktopNav ? (insightPanel ? 1160 : 840) : contentWidth,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: columns,
        gap: desktopNav ? 18 : 0,
        alignItems: 'start',
      }}>
        {desktopNav && (
          <DesktopSidebar root={root} accent={accent} go={go}/>
        )}
        <main style={{
          minWidth: 0,
          minHeight: '100vh',
          background: PALETTE.charcoal.bg,
          borderLeft: desktopNav ? `1px solid ${PALETTE.charcoal.line}` : 'none',
          borderRight: desktopNav ? `1px solid ${PALETTE.charcoal.line}` : 'none',
          boxShadow: desktopNav ? '0 24px 70px rgba(0,0,0,0.28)' : '0 0 0 1px #2c241c, 0 30px 70px rgba(0,0,0,0.34)',
          overflow: 'hidden',
        }}>
          {children}
        </main>
        {desktopNav && insightPanel && (
          <DesktopInsightPanel
            accent={accent}
            weather={weather}
            scaleDevice={scaleDevice}
            onCount={onCount}
            deviceCount={deviceCount}
            activeAutomations={activeAutomations}
            go={go}
          />
        )}
      </div>
    </div>
  )
}

function DesktopSidebar({ root, accent, go }) {
  const items = [
    { route: 'main', root: 'main', label: '홈', Icon: IconHome },
    { route: 'widgets', root: 'widgets', label: '위젯', Icon: IconWidgets },
    { route: 'automations', root: 'automations', label: '자동화', Icon: IconBolt },
    { route: 'notifications', root: 'notifications', label: '알림', Icon: IconSignal },
    { route: 'settings', root: 'settings', label: '설정', Icon: IconSettings },
  ]

  return (
    <aside style={{
      position: 'sticky',
      top: 24,
      minHeight: 'calc(100vh - 48px)',
      background: '#17130f',
      border: `1px solid ${PALETTE.charcoal.line}`,
      borderRadius: 18,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ padding: '7px 6px 12px' }}>
        <div style={{ color: PALETTE.charcoal.text, fontSize: 20, fontWeight: 850, letterSpacing: 0 }}>
          nook
        </div>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 11, marginTop: 3, fontWeight: 700 }}>
          Smart home
        </div>
      </div>
      <nav style={{ display: 'grid', gap: 6 }}>
        {items.map(item => {
          const active = root === item.root || (item.root === 'widgets' && root === 'connections')
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => go(item.route)}
              style={{
                minHeight: 44,
                borderRadius: 13,
                border: `1px solid ${active ? accent + '66' : 'transparent'}`,
                background: active ? accent + '18' : 'transparent',
                color: active ? PALETTE.charcoal.text : PALETTE.charcoal.dim,
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '0 11px',
                fontSize: 13,
                fontWeight: 800,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <item.Icon size={18} color={active ? accent : PALETTE.charcoal.dim}/>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

function DesktopInsightPanel({ accent, weather, scaleDevice, onCount, deviceCount, activeAutomations, go }) {
  const temp = Number(weather?.temp)
  const weatherText = weather ? (weather.pty > 0 ? weather.ptyText : weather.skyText) : '날씨 대기 중'
  return (
    <aside style={{
      position: 'sticky',
      top: 24,
      display: 'grid',
      gap: 12,
    }}>
      <InsightCard
        title="현재 상태"
        value={`${onCount}/${deviceCount}`}
        sub="켜진 기기"
        accent={accent}
        Icon={IconHome}
      />
      <InsightCard
        title="날씨"
        value={Number.isFinite(temp) ? `${Math.round(temp)}°` : '--°'}
        sub={weatherText}
        accent={accent}
        Icon={IconCloud}
        onClick={() => go('weather')}
      />
      <InsightCard
        title="체중계"
        value={scaleDevice ? '준비됨' : '미등록'}
        sub={scaleDevice?.label || '위젯에서 추가'}
        accent={accent}
        Icon={IconScale}
        onClick={() => go(scaleDevice ? `scale:${scaleDevice.id}` : 'widgets')}
      />
      <InsightCard
        title="자동화"
        value={`${activeAutomations}개`}
        sub="활성화"
        accent={accent}
        Icon={IconBolt}
        onClick={() => go('automations')}
      />
    </aside>
  )
}

function InsightCard({ title, value, sub, accent, Icon, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 96,
        borderRadius: 17,
        border: `1px solid ${PALETTE.charcoal.line}`,
        background: PALETTE.charcoal.card,
        color: PALETTE.charcoal.text,
        padding: 15,
        display: 'grid',
        gridTemplateColumns: '1fr 42px',
        gap: 12,
        alignItems: 'center',
        textAlign: 'left',
        fontFamily: 'inherit',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 23, fontWeight: 850, letterSpacing: 0, whiteSpace: 'nowrap' }}>
          {value}
        </div>
        <div style={{ color: PALETTE.charcoal.dim, fontSize: 12, fontWeight: 700, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </div>
      </div>
      <div style={{
        width: 42,
        height: 42,
        borderRadius: 14,
        background: accent + '18',
        border: `1px solid ${accent}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon size={21} color={accent}/>
      </div>
    </Tag>
  )
}

function Toast({ text, accent }) {
  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 'max(24px, env(safe-area-inset-bottom))',
      transform: 'translateX(-50%)', zIndex: 300,
      background: 'rgba(23,19,15,0.96)',
      border: `1px solid ${accent}55`,
      borderRadius: 14, padding: '12px 18px',
      color: PALETTE.charcoal.text, fontSize: 13, fontWeight: 600,
      boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', gap: 10,
      animation: 'overlayFade 200ms ease',
      whiteSpace: 'nowrap',
    }}>
      <IconSparkle size={16} color={accent}/>
      {text}
    </div>
  )
}

function TweaksPanelM({ tweaks, onChange }) {
  return (
    <div style={{
      position: 'fixed', right: 12, bottom: 12, zIndex: 200,
      background: 'rgba(23,19,15,0.96)',
      border: `1px solid ${PALETTE.charcoal.line}`,
      borderRadius: 16, padding: 14, width: 240,
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      color: PALETTE.charcoal.text,
      fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: PALETTE.charcoal.dim, marginBottom: 10 }}>Tweaks</div>
      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginBottom: 6 }}>Accent</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['#e8a23c','#d67a5a','#7ba58f','#8a9cd1','#c77dbe'].map(c => (
          <div key={c} onClick={() => onChange({ accent: c })} style={{
            width: 28, height: 28, borderRadius: 8,
            background: c, cursor: 'pointer',
            boxShadow: tweaks.accent === c ? `0 0 0 2px #14100d, 0 0 0 4px ${c}` : 'none',
          }}/>
        ))}
      </div>
      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginBottom: 6 }}>Corner radius</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {[{k:10,l:'sharp'},{k:14,l:'soft'},{k:20,l:'round'}].map(r => (
          <button key={r.k} onClick={() => onChange({ radius: r.k })} style={{
            flex: 1, padding: '7px', borderRadius: 8,
            background: tweaks.radius === r.k ? PALETTE.charcoal.accent : '#1a1612',
            color: tweaks.radius === r.k ? '#14100d' : PALETTE.charcoal.text,
            border: `1px solid ${PALETTE.charcoal.line}`,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>{r.l}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginBottom: 6 }}>Loading style</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {['spinner','dots','bar'].map(l => (
          <button key={l} onClick={() => onChange({ loading: l })} style={{
            flex: 1, padding: '7px', borderRadius: 8,
            background: tweaks.loading === l ? PALETTE.charcoal.accent : '#1a1612',
            color: tweaks.loading === l ? '#14100d' : PALETTE.charcoal.text,
            border: `1px solid ${PALETTE.charcoal.line}`,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>
    </div>
  )
}

export default AppMobile
