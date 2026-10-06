// Fan detail — A-based spacious layout.

function FanDetail({ state, setState, back, tweaks }) {
  const fan = state.fan;
  const setFan = (f) => setState({ ...state, fan: { ...fan, ...f } });
  const r = tweaks.radius;
  const accent = tweaks.accent;

  return (
    <>
      <DetailHeader title="Fan" onBack={back} accent={accent}
        right={<TinyToggle on={fan.power} accent={accent}
                           onToggle={() => setFan({ power: !fan.power })}/>}/>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Power tile */}
        <button onClick={() => setFan({ power: !fan.power })} style={{
          height: 72, borderRadius: r, border: 'none', cursor: 'pointer',
          background: fan.power ? accent : PALETTE.charcoal.card,
          color: fan.power ? '#14100d' : PALETTE.charcoal.text,
          display: 'flex', alignItems: 'center', padding: '0 18px',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: fan.power ? 'rgba(20,16,13,0.18)' : '#1a1612',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <IconFan size={30} color={fan.power ? '#14100d' : PALETTE.charcoal.dimDeep}
                     spinning={fan.power} speed={fan.speed/50}/>
          </div>
          <div style={{ textAlign: 'left', marginLeft: 14, flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, opacity: 0.7, textTransform: 'uppercase' }}>Power</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 1 }}>{fan.power ? 'ON' : 'OFF'}</div>
          </div>
        </button>

        {/* Speed */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r, padding: '10px 14px',
          border: `1px solid ${PALETTE.charcoal.line}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: PALETTE.charcoal.dim }}>Speed</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: accent }}>{fan.speed}<span style={{ fontSize: 11, marginLeft: 2, color: PALETTE.charcoal.dim }}>%</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setFan({ speed: Math.max(5, fan.speed - 5) })} style={{
              width: 48, height: 44, borderRadius: 10,
              background: '#1a1612', border: `1px solid ${PALETTE.charcoal.line}`,
              color: PALETTE.charcoal.text, fontSize: 22, cursor: 'pointer',
            }}>−</button>
            <div style={{ flex: 1 }}><SpeedBars value={fan.speed} active={fan.power} accent={accent}/></div>
            <button onClick={() => setFan({ speed: Math.min(100, fan.speed + 5) })} style={{
              width: 48, height: 44, borderRadius: 10,
              background: accent, border: 'none',
              color: '#14100d', fontSize: 22, fontWeight: 600, cursor: 'pointer',
            }}>+</button>
          </div>
        </div>

        {/* Oscillate + Angle */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r, padding: '10px 14px',
          border: `1px solid ${PALETTE.charcoal.line}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: PALETTE.charcoal.dim }}>Oscillate</span>
            <TinyToggle on={fan.osc} accent={PALETTE.charcoal.on}
                        onToggle={() => setFan({ osc: !fan.osc })}/>
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <AngleViz angle={fan.angle} active={fan.osc} accent={accent}/>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
              {[30, 60, 90, 120, 140].map(a => {
                const sel = a === fan.angle;
                return (
                  <button key={a} onClick={() => setFan({ angle: a })} style={{
                    flex: '1 0 28%', height: 40, borderRadius: 9,
                    background: sel ? accent : '#1a1612',
                    color: sel ? '#14100d' : PALETTE.charcoal.text,
                    border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>{a}°</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Manual */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            flex: 1, height: 50, borderRadius: r,
            background: '#1a1612', border: `1px solid ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.text,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>← Left</button>
          <button style={{
            flex: 1, height: 50, borderRadius: r,
            background: '#1a1612', border: `1px solid ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.text,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>Right →</button>
        </div>
      </div>
    </>
  );
}

function DetailHeader({ title, onBack, right, accent }) {
  return (
    <div style={{
      height: 52, display: 'flex', alignItems: 'center',
      padding: '0 12px', borderBottom: `1px solid ${PALETTE.charcoal.line}`,
    }}>
      <button onClick={onBack} style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: PALETTE.charcoal.text,
      }}>
        <IconBack/>
      </button>
      <div style={{ fontSize: 15, fontWeight: 600, marginLeft: 10 }}>{title}</div>
      <div style={{ marginLeft: 'auto' }}>{right}</div>
    </div>
  );
}

function SpeedBars({ value, active, accent }) {
  const bars = 18;
  const filled = Math.round(bars * (value / 100));
  return (
    <div style={{ display: 'flex', gap: 3, height: 16, alignItems: 'flex-end' }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h = 5 + (i / bars) * 11;
        const isFilled = i < filled;
        return (
          <div key={i} style={{
            flex: 1, height: h, borderRadius: 2,
            background: isFilled
              ? (active ? accent : PALETTE.charcoal.dimDeep)
              : '#231c15',
          }}/>
        );
      })}
    </div>
  );
}

function AngleViz({ angle, active, accent }) {
  const size = 80;
  const cx = size/2, cy = size - 12;
  const r = 52;
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
      <circle cx={cx} cy={cy} r="3" fill={color}/>
    </svg>
  );
}

Object.assign(window, { FanDetail, DetailHeader, SpeedBars, AngleViz });
