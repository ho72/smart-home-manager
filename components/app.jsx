// Main app — routing, AOD idle timer, Tweaks panel, shared state.

const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#e8a23c",
  "radius": 16,
  "density": "comfy",
  "loading": "spinner"
}/*EDITMODE-END*/;

const INITIAL_STATE = {
  fan:   { power: true,  speed: 60, osc: true,  angle: 120 },
  light: { power: true },
  ac:    { power: false, temp: 24, mode: 'cool' },
  humid: { power: true,  level: 'Auto' },
  scene: null,
};

const AOD_TIMEOUT = 20_000; // 20 seconds

function App() {
  const [screen, setScreen] = useState('main');
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState(INITIAL_STATE);
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [aodEnabled, setAodEnabled] = useState(true);
  const [isAOD, setIsAOD] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const idleTimer = useRef(null);

  const go = (s) => {
    if (s === screen) return;
    setLoading(true);
    setScreen(s);
    setTimeout(() => setLoading(false), 600);
  };

  // Edit-mode bridge
  useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setEditMode(true);
      if (e.data.type === '__deactivate_edit_mode') setEditMode(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const updateTweaks = (patch) => {
    setTweaks(prev => {
      const next = { ...prev, ...patch };
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*');
      return next;
    });
  };

  // Idle timer — any touch within the device resets it.
  const resetIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!aodEnabled) return;
    idleTimer.current = setTimeout(() => {
      if (aodEnabled) setIsAOD(true);
    }, AOD_TIMEOUT);
  };
  useEffect(() => {
    resetIdle();
    return () => idleTimer.current && clearTimeout(idleTimer.current);
  }, [aodEnabled, screen]);

  const wakeFromAOD = () => {
    setIsAOD(false);
    resetIdle();
  };

  // Periodic sync overlay
  useEffect(() => {
    const id = setInterval(() => {
      if (!isAOD) {
        setLoading(true);
        setTimeout(() => setLoading(false), 500);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [isAOD]);

  // Any interaction inside the screen resets idle.
  const handleActivity = () => resetIdle();

  const current = (() => {
    switch (screen) {
      case 'main':     return <MainScreen state={state} setState={setState} go={go} tweaks={tweaks}/>;
      case 'fan':      return <FanDetail  state={state} setState={setState} back={() => go('main')} tweaks={tweaks}/>;
      case 'light':    return <LightDetail state={state} setState={setState} back={() => go('main')} tweaks={tweaks}/>;
      case 'settings': return <SettingsScreen tweaks={tweaks} onChange={updateTweaks}
                                              aod={aodEnabled} setAod={setAodEnabled}
                                              back={() => go('main')}/>;
      default: return null;
    }
  })();

  return (
    <>
      <div className="stage">
        <div className="device-bezel">
          <div className="device-screen" onClick={handleActivity}>
            <div style={{
              position: 'relative',
              width: 480, height: 480,
              background: PALETTE.charcoal.bg,
              overflow: 'hidden',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              color: PALETTE.charcoal.text,
            }}>
              {current}
              <LoadingOverlay show={loading && !isAOD} accent={tweaks.accent} variant={tweaks.loading}/>
              {isAOD && <AODScreen onWake={wakeFromAOD} tweaks={tweaks} state={state}/>}
            </div>
          </div>
        </div>

        <ActionBar
          goAOD={() => setIsAOD(true)}
          wakeAOD={wakeFromAOD}
          isAOD={isAOD}
          aodEnabled={aodEnabled}
          onSettings={() => go('settings')}/>
      </div>

      {editMode && <TweaksPanel tweaks={tweaks} onChange={updateTweaks}/>}
    </>
  );
}

function ActionBar({ goAOD, wakeAOD, isAOD, aodEnabled, onSettings }) {
  return (
    <div className="action-bar">
      <div className="ab-title">ESP32 · 480×480 Smart Remote</div>
      <div className="ab-row">
        {!isAOD
          ? <button className="ab-btn" onClick={goAOD} disabled={!aodEnabled}>Preview AOD now</button>
          : <button className="ab-btn primary" onClick={wakeAOD}>Wake</button>}
        <button className="ab-btn" onClick={onSettings}>Open Settings</button>
      </div>
      <div className="ab-hint">Inactivity 20s → AOD · tap screen to wake</div>
    </div>
  );
}

function TweaksPanel({ tweaks, onChange }) {
  return (
    <div className="tw-panel">
      <h3>Tweaks</h3>
      <div className="tw-row">
        <label>Accent</label>
        <div className="tw-swatches">
          {['#e8a23c','#d67a5a','#7ba58f','#8a9cd1','#c77dbe'].map(c => (
            <div key={c}
              className={`tw-sw ${tweaks.accent === c ? 'sel' : ''}`}
              style={{ background: c }}
              onClick={() => onChange({ accent: c })}/>
          ))}
        </div>
      </div>
      <div className="tw-row">
        <label>Radius</label>
        <div className="tw-seg">
          {[{k:8,l:'sharp'},{k:14,l:'soft'},{k:20,l:'round'}].map(r => (
            <button key={r.k} className={tweaks.radius === r.k ? 'sel' : ''}
              onClick={() => onChange({ radius: r.k })}>{r.l}</button>
          ))}
        </div>
      </div>
      <div className="tw-row">
        <label>Loading</label>
        <div className="tw-seg">
          {['spinner','dots','bar'].map(l => (
            <button key={l} className={tweaks.loading === l ? 'sel' : ''}
              onClick={() => onChange({ loading: l })}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
