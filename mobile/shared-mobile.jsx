import { PALETTE, IconBack, IconChevron, IconFan, IconBulb, IconAC, IconHumid, IconThermo, IconSensor, IconBlind, IconCloud, IconClock, IconBolt, IconWind, IconScale } from '../components/shared'
export { PALETTE } from '../components/shared'

export function DeviceIcon({ iconKey, size = 22, color }) {
  const c = color || PALETTE.charcoal.text
  if (iconKey === 'fan')    return <IconFan size={size} color={c}/>
  if (iconKey === 'bulb')   return <IconBulb size={size} color={c}/>
  if (iconKey === 'ac')     return <IconAC size={size} color={c}/>
  if (iconKey === 'humid')  return <IconHumid size={size} color={c}/>
  if (iconKey === 'thermo') return <IconThermo size={size} color={c}/>
  if (iconKey === 'sensor') return <IconSensor size={size} color={c}/>
  if (iconKey === 'blind')  return <IconBlind size={size} color={c}/>
  if (iconKey === 'cloud')  return <IconCloud size={size} color={c}/>
  if (iconKey === 'clock')  return <IconClock size={size} color={c}/>
  if (iconKey === 'wind')   return <IconWind size={size} color={c}/>
  if (iconKey === 'scale')  return <IconScale size={size} color={c}/>
  return <IconBolt size={size} color={c}/>
}

export function MobileHeader({ title, onBack, right, accent }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      background: 'rgba(20,16,13,0.85)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${PALETTE.charcoal.line}`,
      padding: '10px 14px',
      paddingTop: 'max(10px, env(safe-area-inset-top))',
      display: 'flex', alignItems: 'center', gap: 10,
      minHeight: 54,
    }}>
      {onBack ? (
        <button onClick={onBack} style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${PALETTE.charcoal.line}`,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: PALETTE.charcoal.text,
        }}>
          <IconBack/>
        </button>
      ) : <div style={{ width: 4 }}/>}
      <div style={{ fontSize: 17, fontWeight: 600, flex: 1, color: PALETTE.charcoal.text }}>{title}</div>
      <div>{right}</div>
    </div>
  );
}

export function MobileToggle({ on, onToggle, accent }) {
  return (
    <button onClick={onToggle} style={{
      width: 52, height: 32, borderRadius: 999,
      background: on ? accent : '#2a231c',
      border: 'none', cursor: 'pointer',
      position: 'relative', flexShrink: 0,
      transition: 'background 200ms',
      padding: 0,
    }}>
      <div style={{
        position: 'absolute', top: 3, left: on ? 23 : 3,
        width: 26, height: 26, borderRadius: '50%',
        background: on ? '#14100d' : '#5a4e42',
        transition: 'left 200ms cubic-bezier(.3,.9,.3,1)',
      }}/>
    </button>
  );
}
