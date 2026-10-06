import { useState, useRef, useEffect } from 'react'
import { PALETTE, IconBlind } from '../components/shared'
import { MobileHeader } from './shared-mobile'
import { api } from '../src/api.js'

export function BlindMobile({ state, setState, back, tweaks, deviceId, onShowToast }) {
  const dev = deviceId ? state.devices.find(d => d.id === deviceId) : null
  const level = Math.max(0, Math.min(100, dev?.level ?? 0))
  const shadeState = dev?.shadeState // 'open' | 'closed' | 'opening' | 'closing' | 'partially open'

  const [pendingLevel, setPendingLevel] = useState(level)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  // Sync slider position back to live level once a fetch updates it (and we're not dragging)
  useEffect(() => {
    if (!dragging) setPendingLevel(level)
  }, [level, dragging])

  const r = tweaks.radius
  const accent = tweaks.accent

  const setLocal = (patch) => {
    setState(prev => ({
      ...prev,
      devices: prev.devices.map(d => d.id === deviceId ? { ...d, ...patch } : d),
    }))
  }

  const cmd = async (action, body = {}, optimistic = {}) => {
    if (Object.keys(optimistic).length) setLocal(optimistic)
    setBusy(true)
    try {
      await api.sendCommand(deviceId, action, body, { provider: dev?.provider })
    } catch (e) {
      onShowToast && onShowToast('명령 실패')
    } finally {
      setBusy(false)
    }
  }

  const goOpen  = () => cmd('open',  {},                 { shadeState: 'opening' })
  const goStop  = () => cmd('pause', {},                 { shadeState: 'partially open' })
  const goClose = () => cmd('close', {},                 { shadeState: 'closing' })

  const submitLevel = (lv) => {
    const clipped = Math.round(Math.max(0, Math.min(100, lv)))
    setLocal({ level: clipped, power: clipped > 0,
               shadeState: clipped >= 100 ? 'open' : clipped <= 0 ? 'closed' : 'partially open' })
    cmd('level', { level: clipped })
  }

  const statusLabel =
    shadeState === 'opening' ? '여는 중…' :
    shadeState === 'closing' ? '닫는 중…' :
    level >= 100 ? '열림' :
    level <= 0   ? '닫힘' :
    `${level}% 열림`

  return (
    <>
      <MobileHeader title="블라인드" onBack={back} accent={accent}
        right={<span style={{ fontSize: 12, color: PALETTE.charcoal.dim, paddingRight: 4, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dev?.label || ''}
        </span>}/>

      <div style={{ padding: '14px 14px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Visual window */}
        <div style={{
          height: 280, borderRadius: r + 4,
          background: PALETTE.charcoal.card,
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <WindowVisual level={pendingLevel} accent={accent} animate={!dragging}/>
          <div style={{ marginTop: 16, fontSize: 11, color: PALETTE.charcoal.dim, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 500 }}>
            위치
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: pendingLevel > 0 ? accent : PALETTE.charcoal.dim, marginTop: 4 }}>
            {statusLabel}
          </div>
        </div>

        {/* Up / Stop / Down */}
        <div style={{ display: 'flex', gap: 10 }}>
          <ActionButton onClick={goOpen}  accent={accent} r={r} disabled={busy}
            icon={<ArrowIcon dir="up" color="#14100d"/>} label="올리기"   filled/>
          <ActionButton onClick={goStop}  accent={accent} r={r} disabled={busy}
            icon={<StopIcon  color={PALETTE.charcoal.text}/>} label="정지"/>
          <ActionButton onClick={goClose} accent={accent} r={r} disabled={busy}
            icon={<ArrowIcon dir="down" color={PALETTE.charcoal.text}/>} label="내리기"/>
        </div>

        {/* Percent slider */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '18px',
          border: `1px solid ${PALETTE.charcoal.line}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: PALETTE.charcoal.dim, fontWeight: 500 }}>
              열림 정도
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>
              {Math.round(pendingLevel)}<span style={{ fontSize: 13, color: PALETTE.charcoal.dim, marginLeft: 4 }}>%</span>
            </div>
          </div>

          <PercentSlider
            value={pendingLevel}
            accent={accent}
            onDragStart={() => setDragging(true)}
            onDrag={setPendingLevel}
            onDragEnd={(v) => { setDragging(false); submitLevel(v) }}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {[0, 25, 50, 75, 100].map(p => (
              <button key={p} onClick={() => { setPendingLevel(p); submitLevel(p) }} style={{
                flex: 1, height: 36, borderRadius: 10,
                background: Math.abs(pendingLevel - p) < 2 ? accent + '33' : '#1a1612',
                border: `1px solid ${Math.abs(pendingLevel - p) < 2 ? accent + '88' : PALETTE.charcoal.line}`,
                color: PALETTE.charcoal.text,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>{p}%</button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function WindowVisual({ level, accent, animate }) {
  const lv = Math.max(0, Math.min(100, level))
  const W = 180, H = 200
  const top = 14, bottom = H - 14
  const closedFrac = (100 - lv) / 100
  const closedHeight = (bottom - top) * closedFrac
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* sky behind window */}
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#23344a"/>
          <stop offset="100%" stopColor="#3b5a7d"/>
        </linearGradient>
      </defs>
      <rect x="14" y={top} width={W - 28} height={bottom - top} fill="url(#sky)" rx="3"/>
      {/* Sun */}
      <circle cx={W * 0.72} cy={top + 36} r="14" fill="#f4d28a" opacity={0.85 - closedFrac * 0.7}/>
      {/* Mullions */}
      <line x1={W / 2} y1={top} x2={W / 2} y2={bottom} stroke="#1f1914" strokeWidth="2" opacity="0.5"/>
      <line x1="14" y1={(top + bottom) / 2} x2={W - 14} y2={(top + bottom) / 2} stroke="#1f1914" strokeWidth="2" opacity="0.5"/>
      {/* Frame */}
      <rect x="14" y={top} width={W - 28} height={bottom - top} fill="none" stroke={accent} strokeOpacity="0.7" strokeWidth="2.5" rx="3"/>
      {/* Head rail */}
      <rect x="10" y={top - 6} width={W - 20} height="8" fill={accent} rx="2"/>
      {/* Shade closed portion */}
      {closedHeight > 0 && (
        <g style={animate ? { transition: 'all 220ms ease' } : undefined}>
          <rect x="14" y={top} width={W - 28} height={closedHeight} fill={accent} opacity="0.78"/>
          {/* Subtle horizontal slats */}
          {Array.from({ length: Math.floor(closedHeight / 14) }).map((_, i) => (
            <line key={i} x1="14" y1={top + (i + 1) * 14} x2={W - 14} y2={top + (i + 1) * 14}
                  stroke="#14100d" strokeOpacity="0.15" strokeWidth="1"/>
          ))}
        </g>
      )}
      {/* Pull cord */}
      <line x1={W - 18} y1={top - 6} x2={W - 18} y2={top + closedHeight + 16}
            stroke={accent} strokeOpacity="0.5" strokeWidth="1.2"
            style={animate ? { transition: 'all 220ms ease' } : undefined}/>
      <circle cx={W - 18} cy={top + closedHeight + 18} r="2.5" fill={accent} opacity="0.7"
              style={animate ? { transition: 'all 220ms ease' } : undefined}/>
    </svg>
  )
}

function ActionButton({ onClick, icon, label, filled, accent, r, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, height: 86, borderRadius: r + 2,
      background: filled ? accent : '#1a1612',
      border: filled ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
      color: filled ? '#14100d' : PALETTE.charcoal.text,
      cursor: disabled ? 'wait' : 'pointer', fontFamily: 'inherit',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 6, opacity: disabled ? 0.6 : 1,
    }}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.6 }}>{label}</span>
    </button>
  )
}

function ArrowIcon({ dir, color }) {
  const rot = dir === 'up' ? 0 : 180
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M12 4 L12 20 M5 11 L12 4 L19 11"
            fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function StopIcon({ color }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" fill={color}/>
    </svg>
  )
}

function PercentSlider({ value, accent, onDragStart, onDrag, onDragEnd }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)

  const valueFromEvent = (clientX) => {
    const el = trackRef.current
    if (!el) return value
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    return Math.max(0, Math.min(100, (x / rect.width) * 100))
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    draggingRef.current = true
    onDragStart?.()
    onDrag?.(valueFromEvent(e.clientX))
  }
  const onPointerMove = (e) => {
    if (!draggingRef.current) return
    onDrag?.(valueFromEvent(e.clientX))
  }
  const onPointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const v = valueFromEvent(e.clientX)
    onDragEnd?.(v)
  }

  const pct = Math.max(0, Math.min(100, value))

  return (
    <div ref={trackRef}
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={onPointerUp}
         onPointerCancel={onPointerUp}
         style={{
           position: 'relative', height: 36, padding: '14px 0',
           cursor: 'pointer', touchAction: 'none',
         }}>
      <div style={{
        height: 8, borderRadius: 999,
        background: '#1a1612',
        border: `1px solid ${PALETTE.charcoal.line}`,
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: accent,
          transition: draggingRef.current ? 'none' : 'width 200ms ease',
        }}/>
      </div>
      <div style={{
        position: 'absolute', top: '50%', left: `calc(${pct}% - 12px)`,
        width: 24, height: 24, borderRadius: '50%',
        background: accent, transform: 'translateY(-50%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        border: '2px solid #14100d',
        transition: draggingRef.current ? 'none' : 'left 200ms ease',
        pointerEvents: 'none',
      }}/>
    </div>
  )
}
