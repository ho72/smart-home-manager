import { useState, useEffect } from 'react'
import { PALETTE } from '../components/shared'
import { MobileHeader } from './shared-mobile'
import { api } from '../src/api.js'

const ICON_FOR = {
  sun: '☀️',
  partly: '⛅',
  cloud: '☁️',
  rain: '🌧️',
  snow: '❄️',
}
const DAYS_KOR = ['일', '월', '화', '수', '목', '금', '토']

function fmtDate(yyyymmdd) {
  const y = yyyymmdd.slice(0, 4)
  const m = yyyymmdd.slice(4, 6)
  const d = yyyymmdd.slice(6, 8)
  const date = new Date(`${y}-${m}-${d}T00:00:00`)
  return { day: DAYS_KOR[date.getDay()], md: `${parseInt(m, 10)}/${parseInt(d, 10)}` }
}

function fmtUpdated(epoch) {
  if (!epoch) return ''
  const d = new Date(epoch * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm} 기준`
}

export function WeatherMobile({ back, tweaks, initialCurrent = null }) {
  const accent = tweaks.accent
  const r = tweaks.radius
  const [current, setCurrent] = useState(initialCurrent)
  const [forecast, setForecast] = useState(null)
  const [error, setError] = useState(null)
  const [loadingCurrent, setLoadingCurrent] = useState(!initialCurrent)
  const [loadingForecast, setLoadingForecast] = useState(true)

  useEffect(() => {
    let alive = true
    setError(null)

    api.getWeatherCurrent()
      .then(c => { if (alive) setCurrent(c) })
      .catch(e => {
        if (alive && !initialCurrent) setError(e?.message || '현재 날씨를 불러올 수 없습니다.')
      })
      .finally(() => { if (alive) setLoadingCurrent(false) })

    api.getWeatherForecast()
      .then(f => { if (alive) setForecast(f) })
      .catch(e => {
        if (alive) setError(prev => prev || e?.message || '예보를 불러올 수 없습니다.')
      })
      .finally(() => { if (alive) setLoadingForecast(false) })

    return () => { alive = false }
  }, [])

  return (
    <>
      <MobileHeader title="날씨" onBack={back} accent={accent}/>
      <div style={{ padding: '14px 14px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {loadingCurrent && !current && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: PALETTE.charcoal.dim, fontSize: 13 }}>
            불러오는 중…
          </div>
        )}

        {error && (
          <div style={{ padding: '20px', background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px solid ${PALETTE.charcoal.warn}44`, color: PALETTE.charcoal.warn,
            fontSize: 13, textAlign: 'center', whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}

        {current && (
          <div style={{
            background: PALETTE.charcoal.card, borderRadius: r + 4,
            border: `1px solid ${PALETTE.charcoal.line}`,
            padding: '28px 24px', textAlign: 'center', position: 'relative',
          }}>
            <div style={{ fontSize: 80, lineHeight: 1 }}>{ICON_FOR[current.icon] || '☁️'}</div>
            <div style={{ fontSize: 56, fontWeight: 600, marginTop: 12, color: accent, lineHeight: 1 }}>
              {Math.round(current.temp)}°
            </div>
            <div style={{ fontSize: 14, color: PALETTE.charcoal.dim, marginTop: 8 }}>
              {current.skyText}{current.pty > 0 ? ` · ${current.ptyText}` : ''}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 22, marginTop: 18,
              fontSize: 12, color: PALETTE.charcoal.dim, flexWrap: 'wrap',
            }}>
              <Stat label="습도" value={`${current.humidity}%`}/>
              <Stat label="풍속" value={`${current.windSpeed.toFixed(1)} m/s`}/>
              {current.rain1h > 0 && <Stat label="강수" value={`${current.rain1h}mm`}/>}
            </div>
            <div style={{
              position: 'absolute', top: 12, right: 14,
              fontSize: 10, color: PALETTE.charcoal.dim,
            }}>{fmtUpdated(current.updatedAt)}</div>
          </div>
        )}

        {loadingForecast && current && !forecast && (
          <div style={{
            padding: '14px 16px', background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px solid ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.dim, fontSize: 12, textAlign: 'center',
          }}>
            예보 불러오는 중…
          </div>
        )}

        {forecast?.hourly?.length > 0 && (
          <div style={{
            background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px solid ${PALETTE.charcoal.line}`, padding: '14px 6px 14px 14px',
          }}>
            <div style={{
              fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
              color: PALETTE.charcoal.dim, marginBottom: 12, fontWeight: 500,
            }}>시간별</div>
            <div style={{ display: 'flex', overflowX: 'auto', gap: 16, paddingBottom: 4, paddingRight: 8 }}>
              {forecast.hourly.map((h, i) => (
                <div key={i} style={{ minWidth: 52, textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: PALETTE.charcoal.dim }}>{h.hour}시</div>
                  <div style={{ fontSize: 26, marginTop: 6 }}>{ICON_FOR[h.icon] || '☁️'}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{Math.round(h.temp)}°</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {forecast?.daily?.length > 0 && (
          <div style={{
            background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px solid ${PALETTE.charcoal.line}`, padding: '14px 16px',
          }}>
            <div style={{
              fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
              color: PALETTE.charcoal.dim, marginBottom: 4, fontWeight: 500,
            }}>일별</div>
            {forecast.daily.map((d, i) => {
              const { day, md } = fmtDate(d.date)
              return (
                <div key={d.date} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 0',
                  borderTop: i > 0 ? `1px solid ${PALETTE.charcoal.line}` : `1px solid ${PALETTE.charcoal.line}`,
                }}>
                  <div style={{ width: 50 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{day}</div>
                    <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2 }}>{md}</div>
                  </div>
                  <div style={{ fontSize: 22, width: 32, textAlign: 'center' }}>{ICON_FOR[d.icon] || '☁️'}</div>
                  <div style={{ flex: 1, fontSize: 12, color: PALETTE.charcoal.dim }}>강수 {d.pop}%</div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: PALETTE.charcoal.dim }}>{d.tmin != null ? `${Math.round(d.tmin)}°` : '—'}</span>
                    <span style={{ marginLeft: 8, color: accent, fontWeight: 600 }}>
                      {d.tmax != null ? `${Math.round(d.tmax)}°` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ color: PALETTE.charcoal.dim, fontSize: 11 }}>{label}</div>
      <div style={{ color: PALETTE.charcoal.text, fontSize: 14, fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  )
}
