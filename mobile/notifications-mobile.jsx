import { useEffect, useState } from 'react'
import { PALETTE, IconCloud, IconBolt } from '../components/shared'
import { MobileHeader, MobileToggle } from './shared-mobile'
import { api } from '../src/api.js'

// VAPID base64url public key → Uint8Array (PushManager.subscribe 가 기대하는 형식)
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

async function getActiveSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('이 브라우저는 푸시를 지원하지 않습니다')
  }
  const perm = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('알림 권한이 거부되었습니다')

  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await api.notificationsVapidKey()

  // 항상 기존 구독을 unsubscribe → 새 applicationServerKey 로 재구독.
  // 브라우저는 푸시 제공자(FCM/APNS)에 대한 endpoint 만 새로 받고, 권한 다이얼로그는
  // 다시 안 뜸 (이미 granted). 매번 백엔드와 sub 상태가 일관됨.
  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    try { await existing.unsubscribe() } catch {}
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  localStorage.setItem('nook_vapid_pub', publicKey)
  const json = sub.toJSON()
  await api.notificationsSubscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
  return sub
}

async function unsubscribeFromPush() {
  const sub = await getActiveSubscription()
  if (!sub) return
  try { await api.notificationsUnsubscribe(sub.endpoint) } catch {}
  try { await sub.unsubscribe() } catch {}
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  // iOS Safari 전용
  window.navigator.standalone === true

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)

export function NotificationsMobile({ tweaks, back }) {
  const accent = tweaks.accent
  const r = tweaks.radius

  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [hasSub, setHasSub] = useState(false)
  const [prefs, setPrefs] = useState({ weather: { enabled: false, time: '08:00' } })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  useEffect(() => {
    api.notificationsGetPrefs().then(setPrefs).catch(() => {})
    getActiveSubscription().then(s => setHasSub(!!s)).catch(() => {})
  }, [])

  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator
  const needsAddToHomeScreen = isIOS() && !isStandalone()

  const ensureSubscribed = async () => {
    setError(null); setInfo(null)
    try {
      await subscribeToPush()
      setPermission('granted'); setHasSub(true)
      setInfo('알림이 활성화되었습니다.')
      return true
    } catch (e) {
      setError(e.message || '알림 활성화 실패'); return false
    }
  }

  const toggleWeather = async () => {
    setError(null); setInfo(null)
    const next = !prefs.weather.enabled
    if (next) {
      // 켜기 — 권한 + 구독 먼저, 그 다음 prefs 저장
      setBusy(true)
      try {
        if (Notification.permission !== 'granted' || !hasSub) {
          const ok = await ensureSubscribed()
          if (!ok) { setBusy(false); return }
        }
        const saved = await api.notificationsSavePrefs({
          weather: { enabled: true, time: prefs.weather.time },
        })
        setPrefs(saved)
      } catch (e) {
        setError(e.message || '저장 실패')
      } finally { setBusy(false) }
    } else {
      setBusy(true)
      try {
        const saved = await api.notificationsSavePrefs({
          weather: { enabled: false, time: prefs.weather.time },
        })
        setPrefs(saved)
      } catch (e) {
        setError(e.message || '저장 실패')
      } finally { setBusy(false) }
    }
  }

  const setTime = async (time) => {
    setError(null); setInfo(null)
    setPrefs(p => ({ ...p, weather: { ...p.weather, time } }))
    try {
      const saved = await api.notificationsSavePrefs({
        weather: { enabled: prefs.weather.enabled, time },
      })
      setPrefs(saved)
    } catch (e) { setError(e.message || '시간 저장 실패') }
  }

  const sendTest = async () => {
    setError(null); setInfo(null); setBusy(true)
    try {
      // 항상 subscribe 먼저 — 브라우저에 캐시된 sub 가 있어도 VAPID 키가 회전됐거나
      // 백엔드 구독 목록이 비어있을 수 있으므로, 매번 subscribeToPush() 로 백엔드와 재동기.
      const ok = await ensureSubscribed()
      if (!ok) { setBusy(false); return }
      const result = await api.notificationsTest()
      if (result.sent === 0) {
        setError(`발송 실패 — 등록된 구독이 없습니다 (errors: ${(result.errors || []).join('; ') || '없음'})`)
      } else {
        setInfo(`테스트 발송 완료 (${result.sent}개 기기로 전송, 만료 ${result.removed}개 제거)`)
      }
    } catch (e) { setError(e.message || '테스트 발송 실패') } finally { setBusy(false) }
  }

  return (
    <>
      <MobileHeader title="알림" onBack={back} accent={accent}/>
      <div style={{ padding: '14px 14px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {!supported && (
          <Banner color={PALETTE.charcoal.warn}>
            이 브라우저는 푸시 알림을 지원하지 않습니다.
          </Banner>
        )}
        {supported && needsAddToHomeScreen && (
          <Banner color={accent}>
            iOS 에서는 Safari 의 <b>공유 → 홈 화면에 추가</b> 로 설치한 뒤에만 알림을 받을 수 있어요.
          </Banner>
        )}
        {supported && permission === 'denied' && (
          <Banner color={PALETTE.charcoal.warn}>
            브라우저 설정에서 이 사이트의 알림 권한을 허용해주세요.
          </Banner>
        )}

        {/* 날씨 브리핑 카드 */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2,
          border: `1px solid ${PALETTE.charcoal.line}`, padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11, background: accent + '22',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconCloud size={20} color={accent}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>날씨 브리핑</div>
              <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 3 }}>
                지정한 시각에 오늘 날씨를 알림으로 받습니다
              </div>
            </div>
            <MobileToggle on={prefs.weather.enabled} accent={accent}
              onToggle={() => !busy && toggleWeather()}/>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            opacity: prefs.weather.enabled ? 1 : 0.55,
            pointerEvents: prefs.weather.enabled ? 'auto' : 'none',
            paddingTop: 6, borderTop: `1px solid ${PALETTE.charcoal.line}`,
          }}>
            <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, letterSpacing: 0.4 }}>
              발송 시각
            </div>
            <input type="time" value={prefs.weather.time}
                   onChange={(e) => setTime(e.target.value)}
                   style={{
                     marginLeft: 'auto',
                     background: '#1a1612', border: `1px solid ${PALETTE.charcoal.line}`,
                     borderRadius: 10, padding: '10px 12px',
                     color: PALETTE.charcoal.text, fontSize: 18, fontWeight: 600,
                     fontVariantNumeric: 'tabular-nums',
                     fontFamily: 'inherit', outline: 'none', colorScheme: 'dark',
                   }}/>
          </div>
        </div>

        {/* 테스트 + 권한 안내 */}
        {supported && permission !== 'denied' && (
          <button onClick={sendTest} disabled={busy} style={{
            background: 'transparent', borderRadius: r,
            border: `1px solid ${PALETTE.charcoal.line}`,
            padding: '14px 16px', minHeight: 56,
            color: PALETTE.charcoal.text, fontSize: 13, fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <IconBolt size={16} color={accent}/>
            테스트 알림 보내기
          </button>
        )}

        {info && <Banner color={accent}>{info}</Banner>}
        {error && <Banner color={PALETTE.charcoal.warn}>{error}</Banner>}

        <div style={{
          fontSize: 11, color: PALETTE.charcoal.dimDeep, lineHeight: 1.6,
          padding: '10px 4px', textAlign: 'center',
        }}>
          알림은 앱이 닫혀있어도 옵니다.<br/>
          알림을 누르면 해당 페이지로 이동합니다.
        </div>
      </div>
    </>
  )
}

function Banner({ color, children }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10,
      background: color + '14', border: `1px solid ${color}33`,
      color: PALETTE.charcoal.text, fontSize: 12, lineHeight: 1.5,
    }}>{children}</div>
  )
}
