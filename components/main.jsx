// Main screen — B-based dashboard with 2×2 grid of 4 devices.
// Tapping a device → detail screen. Tapping gear → settings. Tapping clock → AOD.

function MainScreen({ state, setState, go, tweaks }) {
  const t = useClock();
  const { hm, ap } = fmtTime(t);
  const r = tweaks.radius;
  const accent = tweaks.accent;
  const { fan, light, ac, humid, scene } = state;
  const setScene = (s) => setState({ ...state, scene: s });

  const devices = [
    { k: 'fan',   label: 'Fan',   Icon: IconFan,   on: fan.power,
      sub: fan.power ? `${fan.speed}% · ${fan.angle}°` : 'Standby',
      toggle: () => setState({ ...state, fan: { ...fan, power: !fan.power } }),
      anim: fan.power,
      click: () => go('fan') },
    { k: 'light', label: 'Light', Icon: IconBulb,  on: light.power,
      sub: light.power ? 'Illuminated' : 'Off',
      toggle: () => setState({ ...state, light: { ...light, power: !light.power } }),
      anim: light.power,
      click: () => go('light') },
    { k: 'ac',    label: 'AC',    Icon: IconAC,    on: ac.power,
      sub: ac.power ? `${ac.temp}°C · Cool` : 'Off',
      toggle: () => setState({ ...state, ac: { ...ac, power: !ac.power } }) },
    { k: 'humid', label: 'Humidifier', Icon: IconHumid, on: humid.power,
      sub: humid.power ? `${humid.level} · 48%` : 'Off',
      toggle: () => setState({ ...state, humid: { ...humid, power: !humid.power } }) },
  ];

  return (
    <>
      {/* Header row: Home / time / settings */}
      <div style={{
        padding: '12px 14px 8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.4, color: PALETTE.charcoal.dim, textTransform: 'uppercase' }}>
            Home
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 1, letterSpacing: -0.5 }}>
            {hm}<span style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginLeft: 4, fontWeight: 500 }}>{ap}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: PALETTE.charcoal.dim }}>
            <IconCloud size={14} color={PALETTE.charcoal.dim}/>22°C
          </div>
          <div style={{ width: 1, height: 12, background: PALETTE.charcoal.line }}/>
          <IconWifi color={PALETTE.charcoal.on} size={14}/>
          <button onClick={() => go('settings')} style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: 2,
          }}>
            <IconSettings size={18} color={PALETTE.charcoal.text}/>
          </button>
        </div>
      </div>

      {/* Scene row */}
      <div style={{ padding: '0 14px', display: 'flex', gap: 5, marginBottom: 8 }}>
        {[
          { k: 'home',  ico: IconHome, label: 'Home' },
          { k: 'sleep', ico: IconMoon, label: 'Sleep' },
          { k: 'away',  ico: IconLeaf, label: 'Away' },
          { k: 'movie', ico: IconFilm, label: 'Movie' },
        ].map(s => {
          const sel = scene === s.k;
          return (
            <button key={s.k} onClick={() => setScene(sel ? null : s.k)} style={{
              flex: 1, height: 44, borderRadius: 10,
              background: sel ? accent : PALETTE.charcoal.card,
              border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
              color: sel ? '#14100d' : PALETTE.charcoal.text,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, cursor: 'pointer',
            }}>
              <s.ico size={14} color={sel ? '#14100d' : PALETTE.charcoal.text}/>
              <span style={{ fontSize: 9, letterSpacing: 0.4, fontWeight: 600 }}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2×2 device grid */}
      <div style={{
        padding: '0 14px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
      }}>
        {devices.map(d => (
          <DeviceTile key={d.k} d={d} accent={accent} r={r}/>
        ))}
      </div>

      {/* Status strip */}
      <div style={{
        position: 'absolute', bottom: 10, left: 14, right: 14,
        height: 30, borderRadius: 8,
        background: PALETTE.charcoal.card,
        border: `1px solid ${PALETTE.charcoal.line}`,
        display: 'flex', alignItems: 'center',
        padding: '0 12px',
        fontSize: 10, color: PALETTE.charcoal.dim,
        justifyContent: 'space-between',
        whiteSpace: 'nowrap',
      }}>
        <span>{devices.filter(d => d.on).length}/4 on</span>
        <span style={{ color: PALETTE.charcoal.on, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: PALETTE.charcoal.on }}/>
          Synced
        </span>
      </div>
    </>
  );
}

function DeviceTile({ d, accent, r }) {
  return (
    <div onClick={d.click} style={{
      background: PALETTE.charcoal.card,
      borderRadius: r, padding: '12px',
      border: `1px solid ${d.on ? accent + '55' : PALETTE.charcoal.line}`,
      position: 'relative', cursor: d.click ? 'pointer' : 'default',
      height: 156, overflow: 'hidden',
    }}>
      {d.on && (
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 110, height: 110, borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}/>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <d.Icon size={28} color={d.on ? accent : PALETTE.charcoal.dimDeep}
                spinning={d.k === 'fan' && d.anim}
                glow={d.k === 'light' && d.anim}/>
        <TinyToggle on={d.on} accent={accent} onToggle={(e) => { e.stopPropagation(); d.toggle(); }}/>
      </div>
      <div style={{ marginTop: 14, fontSize: 15, fontWeight: 600 }}>{d.label}</div>
      <div style={{ fontSize: 10, color: PALETTE.charcoal.dim, marginTop: 2 }}>{d.sub}</div>
      <div style={{ position: 'absolute', bottom: 10, right: 10, opacity: d.click ? 1 : 0 }}>
        <IconChevron size={14} color={PALETTE.charcoal.dim}/>
      </div>
    </div>
  );
}

function TinyToggle({ on, onToggle, accent }) {
  return (
    <button onClick={onToggle} style={{
      width: 40, height: 24, borderRadius: 999,
      background: on ? accent : '#2a231c',
      border: 'none', cursor: 'pointer',
      position: 'relative', flexShrink: 0,
      transition: 'background 200ms',
    }}>
      <div style={{
        position: 'absolute', top: 3, left: on ? 19 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: on ? '#14100d' : '#5a4e42',
        transition: 'left 200ms cubic-bezier(.3,.9,.3,1)',
      }}/>
    </button>
  );
}

Object.assign(window, { MainScreen, TinyToggle });
