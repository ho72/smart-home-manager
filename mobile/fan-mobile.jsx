import { useEffect, useRef, useState } from 'react'
import { PALETTE, IconFan, IconMoon, IconChevron } from '../components/shared'
import { MobileHeader, MobileToggle } from './shared-mobile'
import { api } from '../src/api.js'

export function FanMobile({ deviceId, state, setState, back, tweaks, onShowToast }) {
  // Resolve target device. Falls back to first fan-typed device, then to the
  // legacy state.fan slot — keeps the screen working for old links / built-in.
  const device = state.devices.find(d => d.id === deviceId) || state.devices.find(d => d.iconKey === 'fan')
  const status = device?.fanStatus
  const initial = status
    ? { power: !!status.power, speed: status.speed ?? 50, osc: !!status.oscillation, angle: status.angle ?? 90, mode: status.mode ?? 0 }
    : { power: !!state.fan?.power, speed: state.fan?.speed ?? 50, osc: !!state.fan?.osc, angle: state.fan?.angle ?? 90, mode: 0 }
  const [fan, setLocal] = useState(initial)

  // 빠른 토글 시 "되돌아가는" 현상 방지. 명령 직후 cooldown 동안엔 폴링 status
  // 로 local 을 덮어쓰지 않음 — stale 한 cloud/device 응답이 최근 사용자 의도를
  // 잠깐 뒤엎는 경합 회피. cooldown 후 다음 status 로 reconcile.
  const lastCmdAtRef = useRef(0)
  const COMMAND_COOLDOWN_MS = 2000

  // Sync local state from polled device status whenever it arrives.
  useEffect(() => {
    if (!status) return
    if (Date.now() - lastCmdAtRef.current < COMMAND_COOLDOWN_MS) return
    setLocal({
      power: !!status.power,
      speed: status.speed ?? 50,
      osc: !!status.oscillation,
      angle: status.angle ?? 90,
      mode: status.mode ?? 0,
    })
  }, [status?.power, status?.speed, status?.oscillation, status?.angle, status?.mode])

  const setFan = (patch) => setLocal(prev => ({ ...prev, ...patch }))

  const targetId = device?.id || deviceId
  const cmd = async (action, params = {}) => {
    lastCmdAtRef.current = Date.now()
    setFan(params)
    if (!targetId) {
      onShowToast && onShowToast('선풍기 ID를 찾을 수 없어요')
      return
    }
    try {
      await api.sendCommand(targetId, action, params, { provider: device?.provider || 'builtin' })
    } catch (e) {
      onShowToast && onShowToast('선풍기 오류: ' + (e.message || '오프라인'))
    }
  }

  // 모드 토글은 빠르게 왔다갔다 누를 수 있는 discrete 속성이라 매 클릭마다 miio
  // 명령을 큐잉하면 직렬화되어 fan 이 차례로 흔들림 (각 명령 ~300ms × N). UI 는
  // 즉시 반영하되 실제 명령은 trailing debounce 로 최종 값만 발사.
  const modeDebounceRef = useRef({ timer: null, latest: 0 })
  const cmdMode = (value) => {
    lastCmdAtRef.current = Date.now()
    setFan({ mode: value })
    modeDebounceRef.current.latest = value
    if (modeDebounceRef.current.timer) clearTimeout(modeDebounceRef.current.timer)
    modeDebounceRef.current.timer = setTimeout(async () => {
      modeDebounceRef.current.timer = null
      if (!targetId) return
      try {
        await api.sendCommand(targetId, 'mode', { mode: modeDebounceRef.current.latest }, { provider: device?.provider || 'builtin' })
      } catch (e) {
        onShowToast && onShowToast('선풍기 오류: ' + (e.message || '오프라인'))
      }
    }, 220)
  }
  const r = tweaks.radius;
  const accent = tweaks.accent;

  return (
    <>
      <MobileHeader title="선풍기" onBack={back} accent={accent}
        right={<MobileToggle on={fan.power} accent={accent}
                             onToggle={() => cmd(fan.power ? 'off' : 'on', { power: !fan.power })}/>}/>

      <div style={{ padding: '14px 14px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Big power tile */}
        <button onClick={() => cmd(fan.power ? 'off' : 'on', { power: !fan.power })} style={{
          height: 110, borderRadius: r + 2, border: 'none', cursor: 'pointer',
          background: fan.power ? accent : PALETTE.charcoal.card,
          color: fan.power ? '#14100d' : PALETTE.charcoal.text,
          display: 'flex', alignItems: 'center', padding: '0 22px',
          textAlign: 'left',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: fan.power ? 'rgba(20,16,13,0.18)' : '#1a1612',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <IconFan size={42} color={fan.power ? '#14100d' : PALETTE.charcoal.dimDeep}
                     spinning={fan.power} speed={fan.speed/50}/>
          </div>
          <div style={{ marginLeft: 18, flex: 1 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.2, opacity: 0.7, textTransform: 'uppercase', fontWeight: 500 }}>전원</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 2 }}>{fan.power ? 'ON' : 'OFF'}</div>
          </div>
        </button>

        {/* Speed card */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
          border: `1px solid ${PALETTE.charcoal.line}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: PALETTE.charcoal.dim, fontWeight: 500 }}>속도</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: accent }}>{fan.speed}<span style={{ fontSize: 14, marginLeft: 3, color: PALETTE.charcoal.dim, fontWeight: 500 }}>%</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => cmd('speed', { speed: Math.max(5, fan.speed - 5), percent: Math.max(5, fan.speed - 5) })} style={{
              width: 56, height: 52, borderRadius: 12,
              background: '#1a1612', border: `1px solid ${PALETTE.charcoal.line}`,
              color: PALETTE.charcoal.text, fontSize: 26, cursor: 'pointer',
            }}>−</button>
            <div style={{ flex: 1 }}>
              <SpeedBars value={fan.speed} active={fan.power} accent={accent}
                onChange={(v) => setFan({ speed: v })}
                onCommit={(v) => cmd('speed', { speed: v, percent: v })}/>
            </div>
            <button onClick={() => cmd('speed', { speed: Math.min(100, fan.speed + 5), percent: Math.min(100, fan.speed + 5) })} style={{
              width: 56, height: 52, borderRadius: 12,
              background: accent, border: 'none',
              color: '#14100d', fontSize: 26, fontWeight: 600, cursor: 'pointer',
            }}>+</button>
          </div>
        </div>

        {/* Wind mode card — 직풍 / 자연풍 (MIoT 2-3) */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
          border: `1px solid ${PALETTE.charcoal.line}`,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
                        color: PALETTE.charcoal.dim, fontWeight: 500, marginBottom: 12 }}>
            바람 모드
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: 0, label: '직풍' },
              { value: 1, label: '자연풍' },
            ].map(opt => {
              const sel = fan.mode === opt.value;
              return (
                <button key={opt.value}
                        onClick={() => cmdMode(opt.value)}
                        style={{
                          flex: 1, height: 52, borderRadius: 12,
                          background: sel ? accent : '#1a1612',
                          color: sel ? '#14100d' : PALETTE.charcoal.text,
                          border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                          fontSize: 15, fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Oscillate card */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
          border: `1px solid ${PALETTE.charcoal.line}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: PALETTE.charcoal.dim, fontWeight: 500 }}>회전</span>
            <MobileToggle on={fan.osc} accent={PALETTE.charcoal.on}
                          onToggle={() => cmd('oscillation', { osc: !fan.osc, enabled: !fan.osc })}/>
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <AngleViz angle={fan.angle} active={fan.osc} accent={accent}/>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              {[30, 60, 90, 120, 140].map(a => {
                const sel = a === fan.angle;
                return (
                  <button key={a} onClick={() => cmd('angle', { angle: a })} style={{
                    flex: '1 0 28%', height: 48, borderRadius: 11,
                    background: sel ? accent : '#1a1612',
                    color: sel ? '#14100d' : PALETTE.charcoal.text,
                    border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                    fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  }}>{a}°</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Manual nudge */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => cmd('left')} style={{
            flex: 1, height: 60, borderRadius: r + 2,
            background: '#1a1612', border: `1px solid ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.text,
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>← 왼쪽</button>
          <button onClick={() => cmd('right')} style={{
            flex: 1, height: 60, borderRadius: r + 2,
            background: '#1a1612', border: `1px solid ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.text,
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>오른쪽 →</button>
        </div>

        {/* Timer / schedule extra */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '14px 18px',
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: '#17130f', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconMoon size={18} color={PALETTE.charcoal.dim}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>취침 타이머</div>
            <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2 }}>2시간 후 자동 꺼짐</div>
          </div>
          <IconChevron size={16} color={PALETTE.charcoal.dim}/>
        </div>
      </div>
    </>
  );
}

// 드래그/탭으로 직접 조정 가능한 슬라이더. onChange = 매 이동시 (로컬 즉시 반영),
// onCommit = 손 떼는 순간 (백엔드로 최종 값 전송).
function SpeedBars({ value, active, accent, onChange, onCommit }) {
  const bars = 18;
  const filled = Math.round(bars * (value / 100));
  const containerRef = useRef(null);
  const draggingRef = useRef(false);
  const lastValueRef = useRef(value);
  useEffect(() => { lastValueRef.current = value; }, [value]);

  const update = (clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const v = Math.round(pct);
    lastValueRef.current = v;
    onChange?.(v);
  };

  const interactive = !!onChange;

  const onPointerDown = (e) => {
    if (!interactive) return;
    e.preventDefault();
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
    update(e.clientX);
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    update(e.clientX);
  };
  const onPointerEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    onCommit?.(lastValueRef.current);
  };

  return (
    <div ref={containerRef}
         role={interactive ? 'slider' : undefined}
         aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={onPointerEnd}
         onPointerCancel={onPointerEnd}
         style={{
           display: 'flex', gap: 3, height: 32, alignItems: 'flex-end',
           cursor: interactive ? 'pointer' : 'default',
           touchAction: interactive ? 'none' : 'auto',  // 시스템 PTR/스크롤 차단
           padding: '6px 0',  // tap 영역 확장
         }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h = 6 + (i / bars) * 14;
        const isFilled = i < filled;
        return (
          <div key={i} style={{
            flex: 1, height: h, borderRadius: 2,
            background: isFilled
              ? (active ? accent : PALETTE.charcoal.dimDeep)
              : '#231c15',
            pointerEvents: 'none',  // 자식이 이벤트 가로채지 않게
          }}/>
        );
      })}
    </div>
  );
}

function AngleViz({ angle, active, accent }) {
  const size = 92;
  const cx = size/2, cy = size - 14;
  const r = 60;
  const half = angle / 2;
  const toXY = (deg) => {
    const rad = (deg - 90) * Math.PI / 180;
    return [cx + Math.cos(rad) * r, cy + Math.sin(rad) * r];
  };
  const [lx, ly] = toXY(-half);
  const [rx, ry] = toXY(half);
  const color = active ? accent : PALETTE.charcoal.dimDeep;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke={PALETTE.charcoal.line} strokeWidth="1.5"/>
      <path d={`M ${cx} ${cy} L ${lx} ${ly} A ${r} ${r} 0 0 1 ${rx} ${ry} Z`}
            fill={color} opacity="0.22"/>
      <line x1={cx} y1={cy} x2={lx} y2={ly} stroke={color} strokeWidth="1.5" opacity="0.8"/>
      <line x1={cx} y1={cy} x2={rx} y2={ry} stroke={color} strokeWidth="1.5" opacity="0.8"/>
      <line x1={cx} y1={cy} x2={cx} y2={cy - r} stroke={color} strokeWidth="2"/>
      <circle cx={cx} cy={cy} r="3.5" fill={color}/>
    </svg>
  );
}
