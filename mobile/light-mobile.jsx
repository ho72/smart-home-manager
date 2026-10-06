import { PALETTE, IconBulb } from '../components/shared'
import { MobileHeader } from './shared-mobile'
import { api } from '../src/api.js'

export function LightMobile({ state, setState, back, tweaks, deviceId, stDeviceId, onShowToast }) {
  const dev   = deviceId ? state.devices.find(d => d.id === deviceId) : null
  const light = dev ? { power: dev.power } : state.light
  const setLight = (patch) => {
    if (deviceId) {
      setState(prev => ({
        ...prev,
        devices: prev.devices.map(d => d.id === deviceId ? { ...d, ...patch } : d),
      }))
    } else {
      setState(prev => ({ ...prev, light: { ...prev.light, ...patch } }))
    }
  }

  const cmd = async (action, patch = {}) => {
    setLight(patch)
    const id = deviceId || 'builtin-light'
    try {
      await api.sendCommand(id, action, {}, { provider: dev?.provider })
    } catch (e) {
      onShowToast && onShowToast('명령 실패')
    }
  }
  const r = tweaks.radius;
  const accent = tweaks.accent;

  return (
    <>
      <MobileHeader title={dev?.label || '조명'} onBack={back} accent={accent}/>

      <div style={{ padding: '14px 14px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Big glow tile */}
        <div style={{
          height: 280, borderRadius: r + 4,
          background: PALETTE.charcoal.card,
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {light.power && (
            <>
              <div style={{
                position: 'absolute', left: '50%', top: 'calc(50% - 28px)',
                width: 330, height: 330, borderRadius: '50%',
                background: `radial-gradient(circle, ${accent}5c 0%, ${accent}3a 30%, ${accent}18 55%, transparent 80%)`,
                filter: 'blur(24px)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
                transformOrigin: '50% 50%',
                willChange: 'transform, opacity',
                animation: 'pulseRing 2.4s ease-in-out infinite',
              }}/>
              <div style={{
                position: 'absolute', left: '50%', top: 'calc(50% - 28px)',
                width: 245, height: 245, borderRadius: '50%',
                background: `radial-gradient(circle, ${accent}70 0%, ${accent}42 34%, ${accent}1c 58%, transparent 82%)`,
                filter: 'blur(18px)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
                transformOrigin: '50% 50%',
                willChange: 'transform, opacity',
                animation: 'pulseRing 2.4s ease-in-out infinite 0.4s',
              }}/>
            </>
          )}
          <div style={{
            width: 140, height: 140, borderRadius: '50%',
            background: light.power ? accent : '#2a231c',
            border: `2px solid ${light.power ? accent : PALETTE.charcoal.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1,
            boxShadow: light.power ? `0 0 60px ${accent}55` : 'none',
          }}>
            <IconBulb size={72} color={light.power ? '#14100d' : PALETTE.charcoal.dimDeep}/>
          </div>
          <div style={{ marginTop: 18, fontSize: 11, color: PALETTE.charcoal.dim, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 500 }}>
            상태
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: light.power ? accent : PALETTE.charcoal.dim, marginTop: 4 }}>
            {light.power ? '켜짐' : '꺼짐'}
          </div>
        </div>

        {/* ON / OFF */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => cmd('on', { power: true })} style={{
            flex: 1, height: 86, borderRadius: r + 2,
            background: light.power ? accent : '#1a1612',
            color: light.power ? '#14100d' : PALETTE.charcoal.text,
            border: light.power ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
            fontSize: 19, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          }}>ON</button>
          <button onClick={() => cmd('off', { power: false })} style={{
            flex: 1, height: 86, borderRadius: r + 2,
            background: !light.power ? PALETTE.charcoal.warn : '#1a1612',
            color: PALETTE.charcoal.text,
            border: !light.power ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
            fontSize: 19, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          }}>OFF</button>
        </div>

      </div>
    </>
  );
}
