import { useEffect, useState } from 'react'
import { PALETTE, IconClock } from '../components/shared'
import { MobileHeader } from './shared-mobile'

const TABS = [
  { id: 'clock', label: '시계' },
  { id: 'stopwatch', label: '스톱워치' },
  { id: 'timer', label: '타이머' },
]

const TIMER_PRESETS = [
  { label: '1분', ms: 60 * 1000 },
  { label: '3분', ms: 3 * 60 * 1000 },
  { label: '5분', ms: 5 * 60 * 1000 },
  { label: '10분', ms: 10 * 60 * 1000 },
]

function pad(value, size = 2) {
  return String(Math.floor(Math.abs(value))).padStart(size, '0')
}

function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatDate(date) {
  return date.toLocaleDateString('ko-KR', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatElapsed(ms) {
  const totalTenths = Math.floor(ms / 100)
  const tenths = totalTenths % 10
  const totalSeconds = Math.floor(totalTenths / 10)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${tenths}`
    : `${pad(minutes)}:${pad(seconds)}.${tenths}`
}

function formatTimer(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}

function panelStyle(r) {
  return {
    background: PALETTE.charcoal.card,
    border: `1px solid ${PALETTE.charcoal.line}`,
    borderRadius: r + 4,
  }
}

function ControlButton({ children, onClick, disabled = false, accent, r, tone = 'default', grow = false }) {
  const primary = tone === 'primary'
  const subtle = tone === 'subtle'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 46,
        flex: grow ? 1 : '0 0 auto',
        minWidth: grow ? 0 : 86,
        padding: '0 16px',
        borderRadius: Math.max(10, r),
        border: primary ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
        background: primary ? accent : subtle ? '#17130f' : '#221b15',
        color: disabled ? PALETTE.charcoal.dim : primary ? '#14100d' : PALETTE.charcoal.text,
        opacity: disabled ? 0.55 : 1,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function ClockFace({ now, accent, r }) {
  const seconds = now.getSeconds()
  const minutes = now.getMinutes() + seconds / 60
  const hours = (now.getHours() % 12) + minutes / 60
  const tickItems = Array.from({ length: 12 }, (_, i) => i)

  const hand = (deg, width, height, color, opacity = 1) => ({
    position: 'absolute',
    left: '50%',
    bottom: '50%',
    width,
    height,
    marginLeft: -width / 2,
    borderRadius: 999,
    background: color,
    opacity,
    transformOrigin: '50% 100%',
    transform: `rotate(${deg}deg)`,
    boxShadow: color === accent ? `0 0 18px ${accent}66` : 'none',
  })

  return (
    <div style={{
      ...panelStyle(r),
      width: 'clamp(220px, 68vw, 286px)',
      aspectRatio: '1 / 1',
      margin: '0 auto',
      position: 'relative',
      background: 'radial-gradient(circle at 50% 42%, #2a2119 0%, #17130f 68%)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
      '--tick-radius': 'calc(clamp(220px, 68vw, 286px) / 2 - 18px)',
    }}>
      {tickItems.map(i => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 18 : 9,
            marginLeft: i % 3 === 0 ? -1.5 : -1,
            marginTop: 0,
            borderRadius: 999,
            background: i % 3 === 0 ? PALETTE.charcoal.text : PALETTE.charcoal.dim,
            opacity: i % 3 === 0 ? 0.78 : 0.42,
            transformOrigin: '50% 0',
            transform: `rotate(${i * 30}deg) translateY(calc(-1 * var(--tick-radius)))`,
          }}
        />
      ))}
      <div style={hand(hours * 30, 8, '28%', PALETTE.charcoal.text, 0.9)} />
      <div style={hand(minutes * 6, 5, '38%', PALETTE.charcoal.text, 0.78)} />
      <div style={hand(seconds * 6, 2, '43%', accent, 1)} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 14,
        height: 14,
        marginLeft: -7,
        marginTop: -7,
        borderRadius: '50%',
        background: accent,
        boxShadow: `0 0 0 5px ${accent}22`,
      }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        bottom: 34,
        transform: 'translateX(-50%)',
        opacity: 0.45,
      }}>
        <IconClock size={20} color={PALETTE.charcoal.dim}/>
      </div>
    </div>
  )
}

function TabButton({ item, active, onClick, accent, r }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 40,
        borderRadius: Math.max(9, r - 2),
        border: `1px solid ${active ? accent + '88' : 'transparent'}`,
        background: active ? accent + '22' : 'transparent',
        color: active ? PALETTE.charcoal.text : PALETTE.charcoal.dim,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {item.label}
    </button>
  )
}

export function ClockMobile({ back, tweaks }) {
  const accent = tweaks.accent
  const r = tweaks.radius
  const [tab, setTab] = useState('clock')
  const [now, setNow] = useState(() => new Date())

  const [stopwatchRunning, setStopwatchRunning] = useState(false)
  const [stopwatchBase, setStopwatchBase] = useState(0)
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState(null)
  const [, setStopwatchTick] = useState(0)
  const [laps, setLaps] = useState([])

  const [timerInitial, setTimerInitial] = useState(5 * 60 * 1000)
  const [timerRemaining, setTimerRemaining] = useState(5 * 60 * 1000)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerEndsAt, setTimerEndsAt] = useState(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!stopwatchRunning) return undefined
    const id = setInterval(() => setStopwatchTick(Date.now()), 100)
    return () => clearInterval(id)
  }, [stopwatchRunning])

  useEffect(() => {
    if (!timerRunning || !timerEndsAt) return undefined

    const tick = () => {
      const next = Math.max(0, timerEndsAt - Date.now())
      setTimerRemaining(next)
      if (next <= 0) {
        setTimerRunning(false)
        setTimerEndsAt(null)
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([140, 70, 140])
        }
      }
    }

    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [timerRunning, timerEndsAt])

  const stopwatchElapsed = stopwatchBase + (
    stopwatchRunning && stopwatchStartedAt ? Date.now() - stopwatchStartedAt : 0
  )

  const startStopwatch = () => {
    setStopwatchStartedAt(Date.now())
    setStopwatchRunning(true)
  }

  const pauseStopwatch = () => {
    if (!stopwatchRunning) return
    setStopwatchBase(stopwatchElapsed)
    setStopwatchStartedAt(null)
    setStopwatchRunning(false)
  }

  const resetStopwatch = () => {
    setStopwatchRunning(false)
    setStopwatchStartedAt(null)
    setStopwatchBase(0)
    setLaps([])
  }

  const addLap = () => {
    if (stopwatchElapsed <= 0) return
    setLaps(prev => [{ id: Date.now(), ms: stopwatchElapsed }, ...prev].slice(0, 20))
  }

  const setTimerDuration = (ms) => {
    setTimerRunning(false)
    setTimerEndsAt(null)
    setTimerInitial(ms)
    setTimerRemaining(ms)
  }

  const adjustTimer = (delta) => {
    const base = timerRunning ? timerRemaining : timerInitial
    const next = Math.max(10 * 1000, Math.min(24 * 60 * 60 * 1000, base + delta))
    setTimerRunning(false)
    setTimerEndsAt(null)
    setTimerInitial(next)
    setTimerRemaining(next)
  }

  const startTimer = () => {
    const next = timerRemaining > 0 ? timerRemaining : timerInitial
    setTimerRemaining(next)
    setTimerEndsAt(Date.now() + next)
    setTimerRunning(true)
  }

  const pauseTimer = () => {
    if (!timerRunning) return
    const next = Math.max(0, (timerEndsAt || Date.now()) - Date.now())
    setTimerRemaining(next)
    setTimerRunning(false)
    setTimerEndsAt(null)
  }

  const resetTimer = () => {
    setTimerRunning(false)
    setTimerEndsAt(null)
    setTimerRemaining(timerInitial)
  }

  const timerProgress = timerInitial > 0
    ? 1 - Math.max(0, Math.min(1, timerRemaining / timerInitial))
    : 0
  const timerDone = !timerRunning && timerRemaining === 0

  return (
    <>
      <MobileHeader title="시계" onBack={back} accent={accent}/>
      <div style={{
        padding: '14px 14px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{
          ...panelStyle(r),
          padding: 4,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 4,
        }}>
          {TABS.map(item => (
            <TabButton
              key={item.id}
              item={item}
              active={tab === item.id}
              onClick={() => setTab(item.id)}
              accent={accent}
              r={r}
            />
          ))}
        </div>

        {tab === 'clock' && (
          <>
            <div style={{ ...panelStyle(r), padding: '24px 18px', textAlign: 'center' }}>
              <div style={{
                fontSize: 54,
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: 0,
                fontVariantNumeric: 'tabular-nums',
                color: accent,
              }}>
                {formatClock(now)}
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: PALETTE.charcoal.dim, fontWeight: 700 }}>
                {formatDate(now)}
              </div>
            </div>
            <ClockFace now={now} accent={accent} r={r}/>
          </>
        )}

        {tab === 'stopwatch' && (
          <>
            <div style={{ ...panelStyle(r), padding: '34px 18px 28px', textAlign: 'center' }}>
              <div style={{
                fontSize: 44,
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: 0,
                fontVariantNumeric: 'tabular-nums',
                color: stopwatchRunning ? accent : PALETTE.charcoal.text,
              }}>
                {formatElapsed(stopwatchElapsed)}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
                <ControlButton
                  accent={accent}
                  r={r}
                  tone="primary"
                  grow
                  onClick={stopwatchRunning ? pauseStopwatch : startStopwatch}
                >
                  {stopwatchRunning ? '일시정지' : '시작'}
                </ControlButton>
                <ControlButton accent={accent} r={r} grow onClick={addLap} disabled={stopwatchElapsed <= 0}>
                  랩
                </ControlButton>
                <ControlButton accent={accent} r={r} grow onClick={resetStopwatch} disabled={stopwatchElapsed <= 0}>
                  초기화
                </ControlButton>
              </div>
            </div>

            <div style={{ ...panelStyle(r), overflow: 'hidden' }}>
              {laps.length === 0 ? (
                <div style={{ padding: '18px', color: PALETTE.charcoal.dim, fontSize: 13, textAlign: 'center' }}>
                  기록 없음
                </div>
              ) : laps.map((lap, index) => (
                <div key={lap.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderTop: index === 0 ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ color: PALETTE.charcoal.dim, fontSize: 13, fontWeight: 800 }}>
                    랩 {laps.length - index}
                  </span>
                  <span style={{ color: PALETTE.charcoal.text, fontSize: 15, fontWeight: 800 }}>
                    {formatElapsed(lap.ms)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'timer' && (
          <>
            <div style={{ ...panelStyle(r), padding: '28px 18px', textAlign: 'center' }}>
              <div style={{
                width: 'clamp(210px, 64vw, 270px)',
                aspectRatio: '1 / 1',
                margin: '0 auto',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: `conic-gradient(${timerDone ? PALETTE.charcoal.warn : accent} ${timerProgress * 360}deg, #17130f 0deg)`,
                boxShadow: timerRunning ? `0 0 28px ${accent}22` : 'none',
              }}>
                <div style={{
                  width: 'calc(100% - 18px)',
                  height: 'calc(100% - 18px)',
                  borderRadius: '50%',
                  background: '#1d1712',
                  display: 'grid',
                  placeItems: 'center',
                  border: `1px solid ${PALETTE.charcoal.line}`,
                }}>
                  <div style={{
                    fontSize: 48,
                    lineHeight: 1,
                    fontWeight: 800,
                    letterSpacing: 0,
                    fontVariantNumeric: 'tabular-nums',
                    color: timerDone ? PALETTE.charcoal.warn : PALETTE.charcoal.text,
                  }}>
                    {formatTimer(timerRemaining)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7, marginTop: 24 }}>
                {TIMER_PRESETS.map(item => {
                  const active = timerInitial === item.ms && !timerRunning
                  return (
                    <button key={item.label} onClick={() => setTimerDuration(item.ms)} style={{
                      height: 38,
                      borderRadius: Math.max(9, r - 3),
                      border: `1px solid ${active ? accent + '88' : PALETTE.charcoal.line}`,
                      background: active ? accent + '22' : '#17130f',
                      color: active ? PALETTE.charcoal.text : PALETTE.charcoal.dim,
                      fontFamily: 'inherit',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}>
                      {item.label}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <ControlButton accent={accent} r={r} tone="subtle" grow onClick={() => adjustTimer(-60 * 1000)}>
                  -1분
                </ControlButton>
                <ControlButton accent={accent} r={r} tone="subtle" grow onClick={() => adjustTimer(60 * 1000)}>
                  +1분
                </ControlButton>
                <ControlButton accent={accent} r={r} tone="subtle" grow onClick={() => adjustTimer(5 * 60 * 1000)}>
                  +5분
                </ControlButton>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <ControlButton
                  accent={accent}
                  r={r}
                  tone="primary"
                  grow
                  onClick={timerRunning ? pauseTimer : startTimer}
                >
                  {timerRunning ? '일시정지' : '시작'}
                </ControlButton>
                <ControlButton accent={accent} r={r} grow onClick={resetTimer}>
                  초기화
                </ControlButton>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
