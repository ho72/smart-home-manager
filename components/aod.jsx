// AOD (Always-on display) — shown after 20s idle. Tap anywhere to wake.

function AODScreen({ onWake, tweaks, state }) {
  const t = useClock();
  const d = t;
  const { hm, ap } = fmtTime(d);
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const accent = tweaks.accent;

  const activeCount = [state.fan.power, state.light.power, state.ac.power, state.humid.power].filter(Boolean).length;

  return (
    <div onClick={onWake} style={{
      position: 'absolute', inset: 0,
      background: '#0a0806',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      animation: 'aodFadeIn 400ms ease-out',
      fontFamily: 'Inter, sans-serif',
      color: '#f4ece0',
    }}>
      {/* Subtle accent ring */}
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        border: `1px solid ${accent}15`,
      }}/>
      <div style={{
        position: 'absolute', width: 340, height: 340, borderRadius: '50%',
        border: `1px solid ${accent}08`,
      }}/>

      {/* Weather chip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        color: '#5a4e42', fontSize: 12, letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        <IconCloud size={14} color="#5a4e42"/>
        Partly cloudy · 22°
      </div>

      {/* Time */}
      <div style={{
        fontSize: 100, fontWeight: 200,
        letterSpacing: -4,
        marginTop: 10,
        color: '#d0c4b3',
        fontFeatureSettings: '"tnum"',
        lineHeight: 1,
      }}>
        {hm}<span style={{ fontSize: 24, color: '#5a4e42', marginLeft: 6, fontWeight: 500, letterSpacing: 0 }}>{ap}</span>
      </div>

      {/* Date */}
      <div style={{
        fontSize: 14, color: '#8a7b6a',
        marginTop: 10, letterSpacing: 0.5,
      }}>
        {dateStr}
      </div>

      {/* Divider */}
      <div style={{
        width: 40, height: 1, background: '#2c241c',
        margin: '20px 0',
      }}/>

      {/* Device status */}
      <div style={{
        display: 'flex', gap: 18, color: '#5a4e42',
        fontSize: 11, letterSpacing: 0.5,
      }}>
        <DeviceDot Icon={IconFan}  on={state.fan.power}   accent={accent}/>
        <DeviceDot Icon={IconBulb} on={state.light.power} accent={accent}/>
        <DeviceDot Icon={IconAC}   on={state.ac.power}    accent={accent}/>
        <DeviceDot Icon={IconHumid} on={state.humid.power} accent={accent}/>
      </div>

      <div style={{
        marginTop: 12, fontSize: 10, color: '#3a322a', letterSpacing: 1.5,
        textTransform: 'uppercase',
      }}>
        {activeCount} active · tap to wake
      </div>
    </div>
  );
}

function DeviceDot({ Icon, on, accent }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
    }}>
      <Icon size={20} color={on ? accent : '#3a322a'}/>
      <div style={{
        width: 4, height: 4, borderRadius: '50%',
        background: on ? accent : '#2c241c',
      }}/>
    </div>
  );
}

Object.assign(window, { AODScreen });
