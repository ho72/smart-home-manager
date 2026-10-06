import { useEffect, useRef, useState } from 'react'
import { PALETTE, IconWind, IconLock } from '../components/shared'
import { MobileHeader, MobileToggle } from './shared-mobile'
import { api } from '../src/api.js'

// MIoT 기준: 0=Auto, 1=Silent(취침), 2=Favorite(즐겨찾기), 3=Fan(수동).
const MODES = [
  { value: 0, label: '자동' },
  { value: 1, label: '취침' },
  { value: 2, label: '즐겨찾기' },
  { value: 3, label: '수동' },
]

// AQI(PM2.5 μg/m³) → 색상. WHO/한국 환경부 단계 기준 단순화.
function aqiColor(aqi) {
  if (aqi == null) return '#8a7b6a'
  if (aqi <= 15)  return '#7dba6b'  // 좋음
  if (aqi <= 35)  return '#e8a23c'  // 보통
  if (aqi <= 75)  return '#d67a5a'  // 나쁨
  return '#c84a3c'                   // 매우 나쁨
}
function aqiLabel(aqi) {
  if (aqi == null) return '—'
  if (aqi <= 15) return '좋음'
  if (aqi <= 35) return '보통'
  if (aqi <= 75) return '나쁨'
  return '매우 나쁨'
}

export function AirPurifierMobile({ deviceId, state, back, tweaks, onShowToast }) {
  const device = state.devices.find(d => d.id === deviceId)
                || state.devices.find(d => d.iconKey === 'wind')
  const status = device?.airStatus

  const initial = status
    ? {
        power: !!status.power,
        mode: status.mode ?? 0,
        fanLevel: status.fanLevel ?? 1,
        favoriteLevel: status.favoriteLevel ?? 0,
        buzzer: !!status.buzzer,
        led: !!status.led,
        childLock: !!status.childLock,
      }
    : { power: false, mode: 0, fanLevel: 1, favoriteLevel: 0, buzzer: false, led: true, childLock: false }
  const [airp, setLocal] = useState(initial)

  // fan 패턴과 동일 — 명령 직후 cooldown 동안엔 폴링 status 로 local 덮어쓰지 않음.
  const lastCmdAtRef = useRef(0)
  const COMMAND_COOLDOWN_MS = 2000

  useEffect(() => {
    if (!status) return
    if (Date.now() - lastCmdAtRef.current < COMMAND_COOLDOWN_MS) return
    setLocal({
      power: !!status.power,
      mode: status.mode ?? 0,
      fanLevel: status.fanLevel ?? 1,
      favoriteLevel: status.favoriteLevel ?? 0,
      buzzer: !!status.buzzer,
      led: !!status.led,
      childLock: !!status.childLock,
    })
  }, [status?.power, status?.mode, status?.fanLevel, status?.favoriteLevel,
      status?.buzzer, status?.led, status?.childLock])

  const setAirp = (patch) => setLocal(prev => ({ ...prev, ...patch }))

  const targetId = device?.id || deviceId
  const cmd = async (action, params = {}, optimistic = {}) => {
    lastCmdAtRef.current = Date.now()
    if (Object.keys(optimistic).length) setAirp(optimistic)
    if (!targetId) return
    try {
      await api.sendCommand(targetId, action, params, { provider: device?.provider || 'xiaomi' })
    } catch (e) {
      onShowToast && onShowToast('공기청정기 오류: ' + (e.message || '오프라인'))
    }
  }

  // 즐겨찾기/팬 단수는 빠른 슬라이더 변경 시 큐잉 → 직렬 발사로 늘어짐. trailing
  // debounce 로 마지막 값만 fan 에 전송 (UI 는 즉시 반영). fan-mobile 의 모드
  // 토글과 같은 패턴.
  const favDebounce = useRef({ timer: null, latest: 0 })
  const cmdFavoriteLevel = (level) => {
    lastCmdAtRef.current = Date.now()
    setAirp({ favoriteLevel: level })
    favDebounce.current.latest = level
    if (favDebounce.current.timer) clearTimeout(favDebounce.current.timer)
    favDebounce.current.timer = setTimeout(async () => {
      favDebounce.current.timer = null
      if (!targetId) return
      try {
        await api.sendCommand(targetId, 'favorite_level',
                              { level: favDebounce.current.latest },
                              { provider: device?.provider || 'xiaomi' })
      } catch (e) {
        onShowToast && onShowToast('공기청정기 오류: ' + (e.message || '오프라인'))
      }
    }, 220)
  }

  const r = tweaks.radius
  const accent = tweaks.accent

  const aqi = status?.aqi
  const temp = status?.temperature
  const humidity = status?.humidity
  const filterLife = status?.filterLifeRemaining
  const motorSpeed = status?.motorSpeed

  // status 에 키가 존재해야만 모델이 그 속성을 지원. 없으면 카드/토글 숨김.
  const has = (k) => status && Object.prototype.hasOwnProperty.call(status, k)
  const supportsFanLevel = has('fanLevel')
  const supportsFavoriteLevel = has('favoriteLevel')
  const supportsBuzzer = has('buzzer')
  const supportsLed = has('led')
  const supportsChildLock = has('childLock')
  const supportsTemp = has('temperature')
  const supportsHumidity = has('humidity')
  const supportsMotorSpeed = has('motorSpeed')
  const supportsFilterLife = has('filterLifeRemaining')

  return (
    <>
      <MobileHeader title="공기청정기" onBack={back} accent={accent}
        right={<MobileToggle on={airp.power} accent={accent}
                             onToggle={() => cmd(airp.power ? 'off' : 'on', {},
                                                { power: !airp.power })}/>}/>

      <div style={{ padding: '14px 14px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* AQI 디스플레이 */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2,
          border: `1px solid ${PALETTE.charcoal.line}`,
          padding: '24px 20px',
          display: 'flex', alignItems: 'center', gap: 18,
        }}>
          <div style={{
            width: 76, height: 76, borderRadius: 22,
            background: aqiColor(aqi) + '22',
            border: `1px solid ${aqiColor(aqi)}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <IconWind size={40} color={aqiColor(aqi)}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
                          color: PALETTE.charcoal.dim, fontWeight: 500 }}>
              실내 공기질 (PM2.5)
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 38, fontWeight: 700, color: aqiColor(aqi) }}>
                {aqi ?? '—'}
              </span>
              <span style={{ fontSize: 13, color: PALETTE.charcoal.dim }}>μg/m³</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: aqiColor(aqi), marginTop: 2 }}>
              {aqiLabel(aqi)}
            </div>
          </div>
        </div>

        {/* 모드 선택 */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
          border: `1px solid ${PALETTE.charcoal.line}`,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
                        color: PALETTE.charcoal.dim, fontWeight: 500, marginBottom: 12 }}>
            모드
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {MODES.map(opt => {
              const sel = airp.mode === opt.value
              return (
                <button key={opt.value}
                        onClick={() => cmd('mode', { mode: opt.value }, { mode: opt.value })}
                        style={{
                          minHeight: 52, borderRadius: 12,
                          background: sel ? accent : '#1a1612',
                          color: sel ? '#14100d' : PALETTE.charcoal.text,
                          border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}>
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 모드별 미세 조정 — 수동(3) 일 때 fan_level 1-3, 즐겨찾기(2) 일 때 favorite 0-14 */}
        {airp.mode === 3 && supportsFanLevel && (
          <div style={{
            background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
            border: `1px solid ${PALETTE.charcoal.line}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
                             color: PALETTE.charcoal.dim, fontWeight: 500 }}>풍량</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: accent }}>{airp.fanLevel}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3].map(lv => {
                const sel = airp.fanLevel === lv
                return (
                  <button key={lv}
                          onClick={() => cmd('fan_level', { level: lv }, { fanLevel: lv })}
                          style={{
                            flex: 1, height: 52, borderRadius: 12,
                            background: sel ? accent : '#1a1612',
                            color: sel ? '#14100d' : PALETTE.charcoal.text,
                            border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                            fontSize: 16, fontWeight: 700, cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}>
                    {lv}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {airp.mode === 2 && supportsFavoriteLevel && (
          <div style={{
            background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
            border: `1px solid ${PALETTE.charcoal.line}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
                             color: PALETTE.charcoal.dim, fontWeight: 500 }}>즐겨찾기 단수</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: accent }}>
                {airp.favoriteLevel}<span style={{ fontSize: 13, color: PALETTE.charcoal.dim, marginLeft: 4, fontWeight: 500 }}>/14</span>
              </span>
            </div>
            <FavoriteSlider value={airp.favoriteLevel} accent={accent}
                            onChange={cmdFavoriteLevel}/>
          </div>
        )}

        {/* 환경/필터 통계 — 모델이 지원하는 것만 동적으로 노출 */}
        {(() => {
          const cells = []
          if (supportsTemp)       cells.push({ label: '온도', value: temp != null ? `${Number(temp).toFixed(1)}°C` : '—', color: accent })
          if (supportsHumidity)   cells.push({ label: '습도', value: humidity != null ? `${humidity}%` : '—', color: accent })
          if (supportsFilterLife) cells.push({
            label: '필터 잔여', value: filterLife != null ? `${filterLife}%` : '—',
            color: filterLife != null && filterLife < 10 ? '#c84a3c' : accent,
          })
          if (supportsMotorSpeed) cells.push({ label: '모터 RPM', value: motorSpeed != null ? motorSpeed : '—', color: PALETTE.charcoal.text })
          if (cells.length === 0) return null
          return (
            <div style={{
              background: PALETTE.charcoal.card, borderRadius: r + 2,
              border: `1px solid ${PALETTE.charcoal.line}`,
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0,
            }}>
              {cells.map((c, i) => {
                const isLastRow = i >= cells.length - (cells.length % 2 || 2)
                const isRight = i % 2 === 1
                return (
                  <StatCell key={c.label} label={c.label} value={c.value}
                            accent={accent} valueColor={c.color}
                            borderRight={!isRight}
                            borderBottom={!isLastRow}/>
                )
              })}
            </div>
          )
        })()}

        {/* 부가 설정 — 모델 지원에 따라 토글 필터링 */}
        {(supportsBuzzer || supportsLed || supportsChildLock) && (
          <div style={{
            background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px solid ${PALETTE.charcoal.line}`,
            overflow: 'hidden',
          }}>
            {supportsBuzzer && (
              <SettingRow label="알림음" sub="버튼/모드 변경 시"
                          on={airp.buzzer} accent={accent}
                          onToggle={() => cmd('buzzer', { enabled: !airp.buzzer },
                                              { buzzer: !airp.buzzer })}/>
            )}
            {supportsBuzzer && supportsLed && <Divider/>}
            {supportsLed && (
              <SettingRow label="디스플레이"
                          on={airp.led} accent={accent}
                          onToggle={() => cmd('led', { enabled: !airp.led },
                                              { led: !airp.led })}/>
            )}
            {(supportsBuzzer || supportsLed) && supportsChildLock && <Divider/>}
            {supportsChildLock && (
              <SettingRow label="잠금"
                          icon={<IconLock size={14} color={PALETTE.charcoal.dim}/>}
                          on={airp.childLock} accent={accent}
                          onToggle={() => cmd('child_lock', { enabled: !airp.childLock },
                                              { childLock: !airp.childLock })}/>
            )}
          </div>
        )}

        {/* 24h 모니터링 — 백엔드 1분 폴링 기반 시계열. 모델이 지원하는 필드만 노출. */}
        <div style={{
          fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim,
          textTransform: 'uppercase', fontWeight: 500, padding: '10px 4px 0',
        }}>
          24시간 모니터링
        </div>
        <SensorChart deviceId={targetId} accent={accent} r={r}
                     supports={{
                       aqi: status && Object.prototype.hasOwnProperty.call(status, 'aqi'),
                       temperature: supportsTemp,
                       humidity: supportsHumidity,
                     }}/>
      </div>
    </>
  )
}

function FavoriteSlider({ value, accent, onChange }) {
  const containerRef = useRef(null)
  const draggingRef = useRef(false)
  const max = 14

  const update = (clientX) => {
    const el = containerRef.current; if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const v = Math.round(pct * max)
    onChange?.(v)
  }
  const onPointerDown = (e) => {
    e.preventDefault()
    draggingRef.current = true
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch {}
    update(e.clientX)
  }
  const onPointerMove = (e) => { if (draggingRef.current) { e.preventDefault(); update(e.clientX) } }
  const onPointerEnd = () => { draggingRef.current = false }

  const filled = (value / max) * 100

  return (
    <div ref={containerRef}
         role="slider" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={onPointerEnd}
         onPointerCancel={onPointerEnd}
         style={{
           position: 'relative', height: 36, padding: '12px 0',
           cursor: 'pointer', touchAction: 'none',
         }}>
      <div style={{
        height: 8, borderRadius: 4, background: '#231c15', position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${filled}%`, height: '100%', background: accent,
          borderRadius: 4,
        }}/>
      </div>
      <div style={{
        position: 'absolute', top: '50%',
        left: `calc(${filled}% - 10px)`,
        width: 20, height: 20, borderRadius: '50%',
        background: accent, border: '3px solid #14100d',
        transform: 'translateY(-50%)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}/>
    </div>
  )
}

function StatCell({ label, value, accent, valueColor, borderRight, borderBottom }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRight: borderRight ? `1px solid ${PALETTE.charcoal.line}` : 'none',
      borderBottom: borderBottom ? `1px solid ${PALETTE.charcoal.line}` : 'none',
    }}>
      <div style={{ fontSize: 11, letterSpacing: 1.0, textTransform: 'uppercase',
                    color: PALETTE.charcoal.dim, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: valueColor || accent, marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}

function SettingRow({ label, sub, icon, on, accent, onToggle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', minHeight: 56,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon}
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2 }}>{sub}</div>
        )}
      </div>
      <MobileToggle on={on} accent={accent} onToggle={onToggle}/>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: PALETTE.charcoal.line }}/>
}

// 24h 시계열 sparkline — 백엔드 1분 폴링과 동일 주기로 refetch (60s).
// 외부 차트 라이브러리 없이 SVG polyline 한 줄. AQI 는 단계별 색, 그 외엔 accent.
function SensorChart({ deviceId, accent, r, supports }) {
  const fields = []
  if (supports.aqi)         fields.push({ key: 'aqi',         label: 'AQI',  unit: 'μg/m³', precision: 0 })
  if (supports.temperature) fields.push({ key: 'temperature', label: '온도', unit: '°C',    precision: 1 })
  if (supports.humidity)    fields.push({ key: 'humidity',    label: '습도', unit: '%',     precision: 0 })

  const [samples, setSamples] = useState([])
  const [field, setField] = useState(fields[0]?.key || 'aqi')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!deviceId) { setLoading(false); return }
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.deviceHistory(deviceId, 24)
        if (!cancelled) setSamples(res?.samples || [])
      } catch {
        // 비어있는 채로 두면 placeholder 가 표시됨.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [deviceId])

  if (fields.length === 0) return null

  const cur = fields.find(f => f.key === field) || fields[0]
  // 선택한 필드의 값이 있는 sample 만 차트에 그림.
  const points = samples
    .map(s => ({ ts: s.ts, v: s[cur.key] }))
    .filter(p => p.v != null && Number.isFinite(p.v))

  const last = points[points.length - 1]
  const minV = points.length ? Math.min(...points.map(p => p.v)) : null
  const maxV = points.length ? Math.max(...points.map(p => p.v)) : null

  // y 도메인: AQI 는 0 baseline 강조, 그 외엔 데이터 min-1 / max+1 로 약간 padding.
  const padPct = 0.1
  let yMin, yMax
  if (cur.key === 'aqi') {
    yMin = 0
    yMax = Math.max(75, (maxV ?? 0) * 1.1)
  } else if (cur.key === 'humidity') {
    yMin = 0
    yMax = 100
  } else {
    const span = (maxV - minV) || 1
    yMin = (minV ?? 0) - span * padPct
    yMax = (maxV ?? 0) + span * padPct
  }

  // x 도메인: 항상 (now-24h, now). 데이터가 적으면 오른쪽 가장자리에 짧게 표시.
  const W = 320, H = 70, padX = 6, padY = 6
  const now = Math.floor(Date.now() / 1000)
  const xStart = now - 24 * 3600
  const xToPx = (ts) => padX + ((ts - xStart) / (24 * 3600)) * (W - 2 * padX)
  const yToPx = (v) =>  padY + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * (H - 2 * padY)
  const pathPoints = points.map(p => `${xToPx(p.ts).toFixed(1)},${yToPx(p.v).toFixed(1)}`).join(' ')

  // AQI 는 마지막 값 단계에 따라 색상 (다른 카드와 일관).
  const stroke = cur.key === 'aqi' ? aqiColor(last?.v ?? null) : accent
  const fillStops = stroke + '33'

  const fmtVal = (v) => v == null ? '—' : Number(v).toFixed(cur.precision)

  return (
    <div style={{
      background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '14px 16px',
      border: `1px solid ${PALETTE.charcoal.line}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {fields.map(f => {
            const sel = f.key === field
            return (
              <button key={f.key} onClick={() => setField(f.key)} style={{
                padding: '6px 10px', borderRadius: 8,
                background: sel ? accent : 'transparent',
                color: sel ? '#14100d' : PALETTE.charcoal.dim,
                border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>{f.label}</button>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, fontWeight: 500 }}>
          최근 24시간
        </div>
      </div>

      {points.length < 2 ? (
        <div style={{
          height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: PALETTE.charcoal.dim, fontSize: 12,
        }}>
          {loading ? '불러오는 중…' : '데이터 수집 중 — 1분 간격으로 쌓입니다'}
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: '100%', height: H, display: 'block' }}>
          {/* 채움 영역 */}
          <polygon
            points={`${pathPoints} ${xToPx(points[points.length-1].ts).toFixed(1)},${(H-padY).toFixed(1)} ${xToPx(points[0].ts).toFixed(1)},${(H-padY).toFixed(1)}`}
            fill={fillStops}/>
          <polyline
            points={pathPoints}
            fill="none" stroke={stroke} strokeWidth="1.6"
            strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between',
                    marginTop: 8, fontSize: 11, color: PALETTE.charcoal.dim }}>
        <span>최저 {fmtVal(minV)} {cur.unit}</span>
        <span>현재 <span style={{ color: stroke, fontWeight: 700 }}>{fmtVal(last?.v)}</span> {cur.unit}</span>
        <span>최고 {fmtVal(maxV)} {cur.unit}</span>
      </div>
    </div>
  )
}
