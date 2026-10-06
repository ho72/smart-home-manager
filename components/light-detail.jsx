// Light detail — A-based with big glow circle.

function LightDetail({ state, setState, back, tweaks }) {
  const light = state.light;
  const setLight = (l) => setState({ ...state, light: { ...light, ...l } });
  const r = tweaks.radius;
  const accent = tweaks.accent;

  return (
    <>
      <DetailHeader title="Light" onBack={back} accent={accent}
        right={<span style={{ fontSize: 11, color: PALETTE.charcoal.dim }}>Living Room</span>}/>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Big glow tile */}
        <div style={{
          height: 210, borderRadius: r,
          background: PALETTE.charcoal.card,
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {light.power && (
            <>
              <div style={{
                position: 'absolute', left: '50%', top: 'calc(50% - 24px)',
                width: 250, height: 250, borderRadius: '50%',
                background: `radial-gradient(circle, ${accent}5c 0%, ${accent}3a 30%, ${accent}18 55%, transparent 80%)`,
                filter: 'blur(20px)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
                transformOrigin: '50% 50%',
                willChange: 'transform, opacity',
                animation: 'pulseRing 2.4s ease-in-out infinite',
              }}/>
              <div style={{
                position: 'absolute', left: '50%', top: 'calc(50% - 24px)',
                width: 188, height: 188, borderRadius: '50%',
                background: `radial-gradient(circle, ${accent}70 0%, ${accent}42 34%, ${accent}1c 58%, transparent 82%)`,
                filter: 'blur(15px)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
                transformOrigin: '50% 50%',
                willChange: 'transform, opacity',
                animation: 'pulseRing 2.4s ease-in-out infinite 0.4s',
              }}/>
            </>
          )}
          <div style={{
            width: 106, height: 106, borderRadius: '50%',
            background: light.power ? accent : '#2a231c',
            border: `2px solid ${light.power ? accent : PALETTE.charcoal.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1,
            boxShadow: light.power ? `0 0 40px ${accent}55` : 'none',
          }}>
            <IconBulb size={54} color={light.power ? '#14100d' : PALETTE.charcoal.dimDeep}/>
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: PALETTE.charcoal.dim, letterSpacing: 1, textTransform: 'uppercase' }}>
            Status
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: light.power ? accent : PALETTE.charcoal.dim, marginTop: 2 }}>
            {light.power ? 'Illuminated' : 'Dark'}
          </div>
        </div>

        {/* ON / OFF */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setLight({ power: true })} style={{
            flex: 1, height: 68, borderRadius: r,
            background: light.power ? accent : '#1a1612',
            color: light.power ? '#14100d' : PALETTE.charcoal.text,
            border: light.power ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
            fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          }}>ON</button>
          <button onClick={() => setLight({ power: false })} style={{
            flex: 1, height: 68, borderRadius: r,
            background: !light.power ? PALETTE.charcoal.warn : '#1a1612',
            color: PALETTE.charcoal.text,
            border: !light.power ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
            fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          }}>OFF</button>
        </div>

        {/* Scene */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { k: 'sleep', ico: IconMoon, label: 'Sleep' },
            { k: 'away',  ico: IconLeaf, label: 'Away' },
            { k: 'movie', ico: IconFilm, label: 'Movie' },
          ].map(s => (
            <button key={s.k} style={{
              flex: 1, height: 46, borderRadius: r,
              background: '#1a1612',
              border: `1px solid ${PALETTE.charcoal.line}`,
              color: PALETTE.charcoal.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>
              <s.ico size={14} color={PALETTE.charcoal.text}/>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { LightDetail });
