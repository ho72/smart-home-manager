// Settings screen — AOD toggle, WiFi flow, Accent color chooser.
// Sub-flows: list → wifi list → password keypad.

const { useState: useStateS } = React;

function SettingsScreen({ tweaks, onChange, aod, setAod, back }) {
  const [view, setView] = useStateS('root'); // root | wifi | password
  const [selectedSSID, setSelectedSSID] = useStateS(null);
  const [password, setPassword] = useStateS('');
  const [connected, setConnected] = useStateS('Home_5G');

  const r = tweaks.radius;
  const accent = tweaks.accent;

  if (view === 'wifi') {
    return <WifiList back={() => setView('root')}
                     accent={accent}
                     connected={connected}
                     onPick={(ssid) => { setSelectedSSID(ssid); setPassword(''); setView('password'); }}/>;
  }
  if (view === 'password') {
    return <WifiPassword ssid={selectedSSID} password={password} setPassword={setPassword}
                         accent={accent}
                         back={() => setView('wifi')}
                         onConnect={() => { setConnected(selectedSSID); setView('root'); }}/>;
  }

  return (
    <>
      <DetailHeader title="Settings" onBack={back} accent={accent}/>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Always-on Display */}
        <Row label="Always-on Display" sub="Dim clock after 20s idle"
             right={<TinyToggle on={aod} accent={accent} onToggle={() => setAod(!aod)}/>}/>

        {/* WiFi */}
        <div onClick={() => setView('wifi')} style={{
          background: PALETTE.charcoal.card, borderRadius: r, padding: '12px 14px',
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          height: 60,
        }}>
          <IconWifi size={20} color={PALETTE.charcoal.on}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Wi-Fi</div>
            <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2 }}>Connected · {connected}</div>
          </div>
          <IconChevron size={16} color={PALETTE.charcoal.dim}/>
        </div>

        {/* Accent color */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r, padding: '12px 14px',
          border: `1px solid ${PALETTE.charcoal.line}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Accent Color</div>
          <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2, marginBottom: 12 }}>
            Theme tint across the UI
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            {['#e8a23c','#d67a5a','#7ba58f','#8a9cd1','#c77dbe'].map(c => {
              const sel = accent === c;
              return (
                <button key={c} onClick={() => onChange({ accent: c })} style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: c, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: sel ? `0 0 0 3px #14100d, 0 0 0 5px ${c}` : 'none',
                  transition: 'box-shadow 150ms',
                }}>
                  {sel && <IconCheck size={22} color="#14100d"/>}
                </button>
              );
            })}
          </div>
        </div>

        {/* About strip */}
        <div style={{
          marginTop: 'auto', textAlign: 'center',
          fontSize: 10, color: PALETTE.charcoal.dimDeep,
          letterSpacing: 1, textTransform: 'uppercase',
          paddingTop: 6,
        }}>
          Nook · v1.0.2
        </div>
      </div>
    </>
  );
}

function Row({ label, sub, right }) {
  return (
    <div style={{
      background: PALETTE.charcoal.card, borderRadius: 14, padding: '12px 14px',
      border: `1px solid ${PALETTE.charcoal.line}`,
      display: 'flex', alignItems: 'center', minHeight: 60,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ── Wi-Fi list ──────────────────────────────────────────────────────────
function WifiList({ back, onPick, connected, accent }) {
  const [scanning, setScanning] = useStateS(true);
  const [networks, setNetworks] = useStateS([]);

  React.useEffect(() => {
    const mock = [
      { ssid: 'Home_5G',       secure: true,  bars: 4 },
      { ssid: 'Home_2.4G',     secure: true,  bars: 3 },
      { ssid: 'NeighborA',     secure: true,  bars: 2 },
      { ssid: 'IoT_Hub',       secure: true,  bars: 2 },
      { ssid: 'Guest-Open',    secure: false, bars: 1 },
      { ssid: 'SK_WiFiGIGA_24', secure: true, bars: 1 },
    ];
    const id = setTimeout(() => { setNetworks(mock); setScanning(false); }, 1100);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <DetailHeader title="Wi-Fi" onBack={back} accent={accent}
        right={<button onClick={() => { setScanning(true); setNetworks([]);
                                        setTimeout(() => { setNetworks([
                                          { ssid: 'Home_5G', secure: true, bars: 4 },
                                          { ssid: 'Home_2.4G', secure: true, bars: 3 },
                                          { ssid: 'NeighborA', secure: true, bars: 2 },
                                          { ssid: 'IoT_Hub', secure: true, bars: 2 },
                                          { ssid: 'Guest-Open', secure: false, bars: 1 },
                                          { ssid: 'SK_WiFiGIGA_24', secure: true, bars: 1 },
                                        ]); setScanning(false); }, 900); }}
                       style={{
                         background: 'transparent', border: 'none',
                         color: accent, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                         padding: '8px 4px',
                       }}>Scan</button>}/>

      <div style={{ padding: '10px 14px', overflow: 'hidden', maxHeight: 418 }}>
        {scanning ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '60px 0', gap: 12,
          }}>
            <Spinner color={accent} size={36}/>
            <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, letterSpacing: 0.5 }}>Scanning networks…</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {networks.map((n, i) => {
              const isConnected = n.ssid === connected;
              return (
                <button key={n.ssid + i} onClick={() => !isConnected && onPick(n.ssid)} style={{
                  height: 54, borderRadius: 12,
                  background: PALETTE.charcoal.card,
                  border: `1px solid ${isConnected ? accent + '55' : PALETTE.charcoal.line}`,
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0 14px', cursor: isConnected ? 'default' : 'pointer',
                  color: PALETTE.charcoal.text,
                  textAlign: 'left',
                }}>
                  <IconSignal size={20} color={PALETTE.charcoal.text} bars={n.bars}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{n.ssid}</div>
                    {isConnected && <div style={{ fontSize: 10, color: accent, marginTop: 2 }}>Connected</div>}
                  </div>
                  {n.secure && <IconLock size={14} color={PALETTE.charcoal.dim}/>}
                  {isConnected && <IconCheck size={16} color={accent}/>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── Password keypad ─────────────────────────────────────────────────────
function WifiPassword({ ssid, password, setPassword, back, onConnect, accent }) {
  const [caps, setCaps] = useStateS(false);
  const [showPw, setShowPw] = useStateS(false);

  const rows = caps
    ? ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']
    : ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  const press = (ch) => setPassword(password + ch);
  const del   = () => setPassword(password.slice(0, -1));

  return (
    <>
      <DetailHeader title={ssid || 'Wi-Fi'} onBack={back} accent={accent}
        right={<button
          onClick={password.length >= 4 ? onConnect : null}
          disabled={password.length < 4}
          style={{
            background: password.length >= 4 ? accent : '#2a231c',
            color: password.length >= 4 ? '#14100d' : PALETTE.charcoal.dim,
            border: 'none', padding: '8px 14px', borderRadius: 10,
            fontSize: 12, fontWeight: 700, cursor: password.length >= 4 ? 'pointer' : 'default',
            letterSpacing: 0.5,
          }}>Connect</button>}/>

      {/* Password display */}
      <div style={{ padding: '10px 14px 6px' }}>
        <div style={{
          height: 48, borderRadius: 12,
          background: PALETTE.charcoal.card,
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex', alignItems: 'center', padding: '0 12px',
          gap: 10,
        }}>
          <IconLock size={16} color={PALETTE.charcoal.dim}/>
          <div style={{
            flex: 1, fontSize: 15,
            color: PALETTE.charcoal.text,
            fontFamily: showPw ? 'Inter, sans-serif' : 'monospace',
            letterSpacing: showPw ? 0 : 3,
          }}>
            {password.length === 0
              ? <span style={{ color: PALETTE.charcoal.dim, fontSize: 12, fontFamily: 'Inter' }}>Password</span>
              : (showPw ? password : '•'.repeat(password.length))}
          </div>
          <button onClick={() => setShowPw(!showPw)} style={{
            background: 'transparent', border: 'none',
            color: PALETTE.charcoal.dim, fontSize: 10, cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: 1,
          }}>{showPw ? 'hide' : 'show'}</button>
        </div>
      </div>

      {/* Keyboard */}
      <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{
            display: 'flex', gap: 3, justifyContent: 'center',
            paddingLeft: ri === 1 ? 14 : ri === 2 ? 28 : 0,
            paddingRight: ri === 1 ? 14 : ri === 2 ? 28 : 0,
          }}>
            {ri === 2 && (
              <button onClick={() => setCaps(!caps)} style={keyStyle(44, caps ? accent : '#1a1612',
                                                                   caps ? '#14100d' : PALETTE.charcoal.text)}>
                ⇧
              </button>
            )}
            {row.split('').map(ch => (
              <button key={ch} onClick={() => press(ch)} style={keyStyle(30)}>
                {ch}
              </button>
            ))}
            {ri === 2 && (
              <button onClick={del} style={keyStyle(44, '#1a1612', PALETTE.charcoal.text)}>
                ⌫
              </button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 2 }}>
          <button onClick={() => press('1')} style={keyStyle(30)}>1</button>
          <button onClick={() => press('2')} style={keyStyle(30)}>2</button>
          <button onClick={() => press('3')} style={keyStyle(30)}>3</button>
          <button onClick={() => press('4')} style={keyStyle(30)}>4</button>
          <button onClick={() => press('5')} style={keyStyle(30)}>5</button>
          <button onClick={() => press('6')} style={keyStyle(30)}>6</button>
          <button onClick={() => press('7')} style={keyStyle(30)}>7</button>
          <button onClick={() => press('8')} style={keyStyle(30)}>8</button>
          <button onClick={() => press('9')} style={keyStyle(30)}>9</button>
          <button onClick={() => press('0')} style={keyStyle(30)}>0</button>
        </div>
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 2 }}>
          <button onClick={() => press('.')} style={keyStyle(30)}>.</button>
          <button onClick={() => press('-')} style={keyStyle(30)}>-</button>
          <button onClick={() => press('_')} style={keyStyle(30)}>_</button>
          <button onClick={() => press('!')} style={keyStyle(30)}>!</button>
          <button onClick={() => press('@')} style={keyStyle(30)}>@</button>
          <button onClick={() => press('#')} style={keyStyle(30)}>#</button>
          <button onClick={() => press(' ')} style={keyStyle(100, '#1a1612')}>space</button>
        </div>
      </div>
    </>
  );
}

function keyStyle(w, bg, fg) {
  return {
    width: w, height: 44, borderRadius: 7,
    background: bg || PALETTE.charcoal.card,
    border: `1px solid ${PALETTE.charcoal.line}`,
    color: fg || PALETTE.charcoal.text,
    fontSize: 15, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    padding: 0,
  };
}

Object.assign(window, { SettingsScreen });
