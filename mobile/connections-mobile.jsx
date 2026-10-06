import { useState, useEffect } from 'react'
import { PALETTE, IconFan, IconBulb, IconAC, IconHumid, IconBolt, IconSensor, IconThermo, IconBlind, IconCloud, IconClock, IconChevron, IconPlus, IconCheck } from '../components/shared'
import { MobileHeader, DeviceIcon } from './shared-mobile'
import { api } from '../src/api.js'

const PROVIDERS = [
  { id: 'widgets', name: 'Widgets', sub: '날씨·체중계·시계 등 유틸리티 추가', hue: '#c77dbe' },
]

const HOME_CATALOGS = [
  { id: 'smartthings', name: 'SmartThings', sub: '홈에 연결된 Samsung 기기', hue: '#3eb3e6' },
  { id: 'xiaomi',      name: 'Xiaomi Home', sub: '홈에 연결된 Xiaomi 기기',  hue: '#ff6a2a' },
]

const WIDGETS_CATALOG = [
  { id: 'wg-weather', label: '날씨', iconKey: 'cloud', sub: '지역 예보', screen: 'weather' },
  { id: 'wg-scale',   label: '체중계', iconKey: 'scale', sub: '체중 기록', screen: 'scale' },
  { id: 'wg-clock',   label: '시계', iconKey: 'clock', sub: '시계 · 스톱워치 · 타이머', screen: 'clock' },
  { id: 'wg-energy',  label: '에너지', iconKey: 'bolt',  sub: '전체 사용량' },
]

export function WidgetsMobile({ route, state, setState, back, go, tweaks, onDeviceAdded, onDeviceRemoved }) {
  const accent = (tweaks && tweaks.accent) || '#e8a23c'
  const r = (tweaks && tweaks.radius) || 14
  const parts = (route || '').split(':')
  const provider = parts[1]
  const routeHomeId = parts[2] === 'home' ? parts[3] : null
  const routeHomeSource = parts[2] === 'home' ? parts[4] : null
  const deviceId = parts[2] === 'home' ? null : parts[2]
  const [homesSummary, setHomesSummary] = useState(null)
  const [selectedHomeId, setSelectedHomeId] = useState(null)

  useEffect(() => {
    let alive = true
    api.homes()
      .then(data => {
        if (!alive) return
        setHomesSummary(data)
        const homes = data?.homes || []
        setSelectedHomeId(prev => routeHomeId || prev || homes[0]?.id || data?.current?.id || null)
      })
      .catch(() => {
        if (alive) setHomesSummary({ homes: [] })
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (routeHomeId) setSelectedHomeId(routeHomeId)
  }, [routeHomeId])

  const homes = homesSummary?.homes || []
  const targetHome = homes.find(h => h.id === selectedHomeId) || homes[0] || null
  const homePicker = {
    homes,
    targetHome,
    selectedHomeId: targetHome?.id || selectedHomeId,
    onSelectHome: setSelectedHomeId,
    loading: homesSummary === null,
  }

  const fixedHomeBack = routeHomeId
    ? () => go(`homes:detail:${routeHomeId}${routeHomeSource ? `:${routeHomeSource}` : ''}`)
    : null

  if (provider === 'xiaomi' && !deviceId) return <XiaomiCatalog state={state} back={fixedHomeBack || (() => go('widgets'))} go={go} accent={accent} r={r} onDeviceAdded={onDeviceAdded} homePicker={homePicker} fixedHome={Boolean(routeHomeId)}/>
  if (provider && !deviceId) return <ProviderCatalog provider={provider} state={state} back={() => go('widgets')} go={go} accent={accent} r={r} homePicker={homePicker}/>
  if (provider && deviceId) return <DeviceAdd provider={provider} deviceId={deviceId} state={state} setState={setState} back={() => go('widgets:' + provider)} go={go} accent={accent} r={r} onDeviceAdded={onDeviceAdded} homePicker={homePicker}/>
  return <ConnectionsHome back={back} go={go} accent={accent} r={r} state={state} onDeviceRemoved={onDeviceRemoved} onDeviceUpdated={onDeviceAdded} homePicker={homePicker}/>
}

function deviceBelongsToHome(device, homeId) {
  return !homeId || !device.homeId || device.homeId === homeId
}

function HomeTargetNote({ picker, accent, r, stats = null, compact = false }) {
  const { homes, targetHome, selectedHomeId, onSelectHome, loading } = picker
  return (
    <div style={{
      background: PALETTE.charcoal.card, border: `1px solid ${PALETTE.charcoal.line}`,
      color: PALETTE.charcoal.text, borderRadius: r + 2,
      padding: compact ? '12px' : '14px', fontSize: 12, lineHeight: 1.35,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <span style={{ color: PALETTE.charcoal.dim, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
          기기 추가 홈
        </span>
        <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loading ? '확인 중…' : (targetHome?.name || '홈 없음')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 1 }}>
        {(loading ? [] : homes).map(h => {
          const selected = h.id === selectedHomeId
          return (
            <button key={h.id} onClick={() => onSelectHome(h.id)} style={{
              flexShrink: 0, height: 34, padding: '0 12px', borderRadius: 9,
              border: `1px solid ${selected ? accent + '99' : PALETTE.charcoal.line}`,
              background: selected ? accent + '22' : '#17130f',
              color: selected ? PALETTE.charcoal.text : PALETTE.charcoal.dim,
              fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              {h.name}
            </button>
          )
        })}
        {!loading && homes.length === 0 && (
          <div style={{ color: PALETTE.charcoal.dim, fontSize: 12 }}>등록된 홈이 없습니다</div>
        )}
      </div>
      {!compact && stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 7, marginTop: 12,
        }}>
          {stats.map(item => (
            <div key={item.label} style={{
              background: '#17130f', borderRadius: 9,
              border: `1px solid ${item.tone === 'ok' ? '#16a34a55' : item.tone === 'warn' ? PALETTE.charcoal.warn + '44' : PALETTE.charcoal.line}`,
              padding: '9px 8px', minWidth: 0,
            }}>
              <div style={{ fontSize: 10, color: PALETTE.charcoal.dim, fontWeight: 700, marginBottom: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </div>
              <div style={{ fontSize: 12, color: item.tone === 'warn' ? PALETTE.charcoal.warn : PALETTE.charcoal.text,
                fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function catalogMeta(provider) {
  return [...PROVIDERS, ...HOME_CATALOGS].find(x => x.id === provider)
}


function ConnectionsHome({ back, go, accent, r, state, onDeviceRemoved, onDeviceUpdated, homePicker }) {
  const targetHome = homePicker.targetHome
  const [removing, setRemoving] = useState(null)
  const [stStatus, setStStatus] = useState(null)
  const [xiaomiConnected, setXiaomiConnected] = useState(null)

  useEffect(() => {
    if (homePicker.loading) return
    let alive = true
    setStStatus(null)
    setXiaomiConnected(null)
    const homeId = targetHome?.id
    if (!homeId) {
      setStStatus({ connected: false })
      setXiaomiConnected(false)
      return () => { alive = false }
    }
    api.smartthingsOAuthStatus({ homeId })
      .then(s => { if (alive) setStStatus(s) })
      .catch(() => { if (alive) setStStatus({ connected: false }) })
    api.xiaomiCloudCatalog({ homeId })
      .then(({ fetchedAt }) => { if (alive) setXiaomiConnected(Boolean(fetchedAt)) })
      .catch(() => { if (alive) setXiaomiConnected(false) })
    return () => { alive = false }
  }, [homePicker.loading, targetHome?.id])

  const removeDevice = async (deviceId) => {
    setRemoving(deviceId)
    try { await api.removeDevice(deviceId); onDeviceRemoved?.() } catch {}
    setRemoving(null)
  }
  const renameDevice = async (deviceId, label) => {
    await api.updateDevice(deviceId, { label })
    onDeviceUpdated?.()
  }

  const targetHomeId = targetHome?.id
  const addedDevices = (state?.devices || [])
    .filter(d => d.provider !== 'builtin' && deviceBelongsToHome(d, targetHomeId))
  const providerCounts = {
    smartthings: addedDevices.filter(d => d.provider === 'smartthings').length,
    xiaomi: addedDevices.filter(d => d.provider === 'xiaomi').length,
    widgets: addedDevices.filter(d => d.provider === 'widgets').length,
  }
  const homeName = targetHome?.name || '선택 홈'
  const homeStats = [
    {
      label: 'SmartThings',
      value: stStatus === null ? '확인 중' : stStatus?.connected ? `${providerCounts.smartthings}개` : '미연동',
      tone: stStatus === null ? 'idle' : stStatus?.connected ? 'ok' : 'warn',
    },
    {
      label: 'Xiaomi',
      value: xiaomiConnected === null ? '확인 중' : xiaomiConnected ? `${providerCounts.xiaomi}개` : '미연동',
      tone: xiaomiConnected === null ? 'idle' : xiaomiConnected ? 'ok' : 'warn',
    },
    { label: '위젯', value: `${providerCounts.widgets}개`, tone: providerCounts.widgets ? 'ok' : 'idle' },
  ]

  const INTEGRATIONS = [
    {
      id: 'smartthings',
      label: 'SmartThings',
      sub: stStatus?.connected ? `${homeName}에 추가된 기기 ${providerCounts.smartthings}개` : `${homeName}에 연결된 계정 없음`,
      hue: '#3eb3e6',
      connected: stStatus?.connected,
      loading: stStatus === null,
      cta: '연결',
    },
    {
      id: 'xiaomi',
      label: 'Xiaomi Home',
      sub: xiaomiConnected ? `${homeName} 기기 목록 동기화됨 · 추가 ${providerCounts.xiaomi}개` : `${homeName}에 연결된 계정 없음`,
      hue: '#ff6a2a',
      connected: xiaomiConnected === true,
      loading: xiaomiConnected === null,
      cta: '연결',
    },
  ]

  return (
    <>
      <MobileHeader title="위젯" onBack={back} accent={accent}/>
      <div style={{ padding: '14px 14px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <HomeTargetNote picker={homePicker} accent={accent} r={r} stats={homeStats}/>

        {/* 홈 계정 기기 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: PALETTE.charcoal.dim,
            letterSpacing: 1, textTransform: 'uppercase', padding: '0 2px', marginBottom: 8 }}>
            홈 계정 기기
          </div>
          <div style={{ background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px solid ${PALETTE.charcoal.line}`, overflow: 'hidden' }}>
            {INTEGRATIONS.map((p, i) => {
              const isLast = i === INTEGRATIONS.length - 1
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                  borderBottom: isLast ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                  cursor: p.connected ? 'pointer' : 'default',
                  opacity: p.loading ? 0.5 : 1,
                }} onClick={() => p.connected && go('widgets:' + p.id)}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                    background: p.loading ? PALETTE.charcoal.dim
                              : p.connected ? '#16a34a'
                              : PALETTE.charcoal.dim,
                  }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 2 }}>
                      {p.loading ? '확인 중…' : p.sub}
                    </div>
                  </div>
                  {p.loading ? null : p.connected ? (
                    <IconChevron size={16} color={PALETTE.charcoal.dim}/>
                  ) : (
                    <button onClick={(e) => {
                      e.stopPropagation()
                      go(targetHomeId ? `homes:detail:${targetHomeId}:widgets` : 'homes:detail::widgets')
                    }} style={{
                      height: 28, padding: '0 12px', borderRadius: 8, border: 'none',
                      background: accent, color: '#14100d',
                      fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                      flexShrink: 0,
                    }}>{p.cta}</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 유틸리티 위젯 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: PALETTE.charcoal.dim,
            letterSpacing: 1, textTransform: 'uppercase', padding: '0 2px', marginBottom: 8 }}>
            유틸리티 위젯
          </div>
          <button onClick={() => go('widgets:widgets')} style={{
            width: '100%', background: PALETTE.charcoal.card, borderRadius: r + 2,
            padding: '14px 16px', border: `1px solid ${PALETTE.charcoal.line}`,
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', textAlign: 'left', color: PALETTE.charcoal.text,
            fontFamily: 'inherit',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Widgets</div>
              <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 2 }}>
                날씨·체중계·시계 등 유틸리티 타일 추가
              </div>
            </div>
            <IconChevron size={16} color={PALETTE.charcoal.dim}/>
          </button>
        </div>

        {/* 추가된 기기 */}
        {addedDevices.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: PALETTE.charcoal.dim,
              letterSpacing: 1, textTransform: 'uppercase', padding: '0 2px', marginBottom: 8 }}>
              {homeName}에 추가된 항목
            </div>
            <div style={{ background: PALETTE.charcoal.card, borderRadius: r + 2,
              border: `1px solid ${PALETTE.charcoal.line}`, overflow: 'hidden' }}>
              {addedDevices.map((d, i) => (
                <AddedDeviceRow key={d.id} d={d} accent={accent}
                  isLast={i === addedDevices.length - 1}
                  removing={removing === d.id}
                  onRemove={() => removeDevice(d.id)}
                  onRename={(label) => renameDevice(d.id, label)}/>
              ))}
            </div>
          </div>
        )}
        {addedDevices.length === 0 && !homePicker.loading && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: PALETTE.charcoal.dim,
              letterSpacing: 1, textTransform: 'uppercase', padding: '0 2px', marginBottom: 8 }}>
              {homeName}에 추가된 항목
            </div>
            <div style={{
              background: PALETTE.charcoal.card, borderRadius: r + 2,
              border: `1px dashed ${PALETTE.charcoal.line}`,
              padding: '22px 16px', textAlign: 'center',
              color: PALETTE.charcoal.dim, fontSize: 13,
            }}>
              이 홈에 추가된 항목이 없습니다.
            </div>
          </div>
        )}
      </div>
    </>
  )
}


function AddedDeviceRow({ d, accent, isLast, removing, onRemove, onRename }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(d.label)
  const [saving, setSaving] = useState(false)
  // d.label 이 외부 갱신될 수도 있으니 prop 변화 시 동기화 (편집 중엔 X)
  useEffect(() => { if (!editing) setVal(d.label) }, [d.label, editing])

  const commit = async () => {
    const v = val.trim()
    if (!v || v === d.label) {
      setVal(d.label)
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onRename(v)
    } catch {
      setVal(d.label)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
    }}>
      <DeviceIcon iconKey={d.iconKey} size={20} color={accent}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input value={val} maxLength={28} autoFocus disabled={saving}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur()
              if (e.key === 'Escape') { setVal(d.label); setEditing(false) }
            }}
            style={{
              width: '100%', background: 'transparent',
              border: `1px solid ${accent}66`, borderRadius: 8,
              padding: '6px 10px', color: PALETTE.charcoal.text,
              fontSize: 14, fontWeight: 600, fontFamily: 'inherit', outline: 'none',
            }}/>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.label}
          </div>
        )}
        <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.sub || d.provider}
        </div>
      </div>
      {!editing && (
        <>
          <button onClick={() => setEditing(true)} disabled={removing} style={{
            height: 34, padding: '0 12px', borderRadius: 9,
            background: '#1a1612', border: `1px solid ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.text, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>이름 변경</button>
          <button onClick={onRemove} disabled={removing} style={{
            height: 34, padding: '0 12px', borderRadius: 9,
            background: '#2a1a1a', border: `1px solid ${PALETTE.charcoal.warn}44`,
            color: PALETTE.charcoal.warn, fontSize: 12, fontWeight: 600,
            cursor: removing ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}>{removing ? '…' : '제거'}</button>
        </>
      )}
    </div>
  )
}

function ProviderCatalog({ provider, state, back, go, accent, r, homePicker }) {
  const p = catalogMeta(provider)
  const targetHome = homePicker.targetHome
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const targetHomeId = targetHome?.id
  const homeName = targetHome?.name || '선택 홈'
  const stateDevicesForHome = (state.devices || []).filter(d => deviceBelongsToHome(d, targetHomeId))
  const addedStIds = new Set(stateDevicesForHome.map(d => d.stDeviceId).filter(Boolean))
  const addedWidgetIds = new Set(stateDevicesForHome.map(d => d.sourceId).filter(Boolean))

  useEffect(() => {
    if (provider === 'smartthings') {
      if (homePicker.loading) return
      if (!targetHomeId) {
        setCatalog([])
        return
      }
      let alive = true
      setLoading(true)
      setError(null)
      api.getSmartThingsCatalog({ homeId: targetHomeId })
        .then(data => { if (alive) setCatalog(data) })
        .catch(e => { if (alive) setError(e.message || '불러오기 실패') })
        .finally(() => { if (alive) setLoading(false) })
      return () => { alive = false }
    } else if (provider === 'widgets') {
      setCatalog(WIDGETS_CATALOG)
    }
  }, [provider, homePicker.loading, targetHomeId])

  const isAdded = (item) => {
    if (provider === 'smartthings') return item.alreadyAdded || addedStIds.has(item.deviceId)
    return addedWidgetIds.has(item.id)
  }

  const getItemId = (item) => provider === 'smartthings' ? item.deviceId : item.id

  return (
    <>
      <MobileHeader title={p?.name || '기기'} onBack={back} accent={accent}/>
      <div style={{ padding: '14px 14px 28px' }}>
        <HomeTargetNote picker={homePicker} accent={accent} r={r} compact/>
        
        {loading && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: PALETTE.charcoal.dim, fontSize: 13 }}>
            기기 불러오는 중…
          </div>
        )}
        {error && (
          <div style={{ padding: '24px', background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px solid ${PALETTE.charcoal.warn}44`, color: PALETTE.charcoal.warn, fontSize: 13, textAlign: 'center' }}>
            <div>{error}</div>
          </div>
        )}
        {!loading && !error && (
          <>
            <div style={{ fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim, textTransform: 'uppercase', fontWeight: 500, padding: '2px 4px 12px' }}>
              {homeName}에서 사용 가능 · {catalog.length}
            </div>
            {catalog.length === 0 ? (
              <div style={{
                padding: '28px 16px', textAlign: 'center',
                background: PALETTE.charcoal.card, borderRadius: r + 2,
                border: `1px dashed ${PALETTE.charcoal.line}`,
                color: PALETTE.charcoal.dim, fontSize: 13,
              }}>
                {provider === 'smartthings'
                  ? `${homeName}에 연결된 SmartThings 기기가 없습니다.`
                  : `${homeName}에 추가할 수 있는 위젯이 없습니다.`}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {catalog.map(d => {
                const added = isAdded(d)
                const id = getItemId(d)
                return (
                  <button key={id}
                    onClick={() => !added && go('widgets:' + provider + ':' + id)}
                    disabled={added}
                    style={{
                      background: PALETTE.charcoal.card, borderRadius: r,
                      padding: '14px 16px', border: `1px solid ${PALETTE.charcoal.line}`,
                      display: 'flex', alignItems: 'center', gap: 12,
                      cursor: added ? 'default' : 'pointer', textAlign: 'left',
                      color: added ? PALETTE.charcoal.dim : PALETTE.charcoal.text,
                      minHeight: 68, opacity: added ? 0.55 : 1,
                    }}>
                    <DeviceIcon iconKey={d.iconKey} size={24} color={added ? PALETTE.charcoal.dim : accent}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2 }}>{d.sub}</div>
                    </div>
                    {added ? (
                      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, letterSpacing: 0.6, fontWeight: 600 }}>추가됨</div>
                    ) : (
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, background: accent + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}><IconPlus size={16} color={accent}/></div>
                    )}
                  </button>
                )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function DeviceAdd({ provider, deviceId, state, setState, back, go, accent, r, onDeviceAdded, homePicker }) {
  const targetHome = homePicker.targetHome
  const homeName = targetHome?.name || '홈'
  const [catalog, setCatalog] = useState(null)
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if ((provider === 'smartthings' || provider === 'xiaomi') && homePicker.loading) return
    const homeId = targetHome?.id
    if ((provider === 'smartthings' || provider === 'xiaomi') && !homeId) {
      setCatalog(null)
      setError('홈을 먼저 추가하세요.')
      return
    }
    let alive = true
    if (provider === 'smartthings') {
      setLoading(true)
      setError(null)
      api.getSmartThingsCatalog({ homeId })
        .then(data => {
          if (!alive) return
          const found = data.find(d => d.deviceId === deviceId)
          setCatalog(found || null)
          setLabel(found?.label || '')
        })
        .catch(() => { if (alive) setError('기기 불러오기 실패') })
        .finally(() => { if (alive) setLoading(false) })
    } else if (provider === 'xiaomi') {
      setLoading(true)
      setError(null)
      api.xiaomiCloudCatalog({ homeId })
        .then(({ catalog: data }) => {
          if (!alive) return
          const found = (data || []).find(d => d.did === deviceId)
          setCatalog(found || null)
          setLabel(found?.label || '')
        })
        .catch(() => { if (alive) setError('기기 불러오기 실패') })
        .finally(() => { if (alive) setLoading(false) })
    } else if (provider === 'widgets') {
      const found = WIDGETS_CATALOG.find(d => d.id === deviceId)
      setCatalog(found || null)
      setLabel(found?.label || '')
    }
    return () => { alive = false }
  }, [provider, deviceId, homePicker.loading, targetHome?.id])

  const add = async () => {
    if (homePicker.loading || !targetHome) return
    if (!catalog) return
    if (provider === 'xiaomi' && !catalog.supported) {
      setError('아직 지원하지 않는 기기 종류입니다.')
      return
    }
    setAdding(true)
    let newDevice
    // type 은 백엔드 dispatch key (예: 공기청정기는 iconKey='wind' 인데
    // type='airpurifier'). catalog 가 type 을 줄 때만 따로 사용, 아니면 iconKey.
    const dispatchType = catalog.type || catalog.iconKey
    const homeId = targetHome?.id
    if (provider === 'smartthings') {
      newDevice = {
        id: `st-${deviceId}`,
        provider, type: dispatchType,
        label: label.trim() || catalog.label,
        iconKey: catalog.iconKey, sub: catalog.sub || '',
        screen: catalog.screen || null, power: false,
        stDeviceId: deviceId, sourceId: deviceId, homeId,
      }
    } else if (provider === 'xiaomi') {
      newDevice = {
        id: `xiaomi-${deviceId}`,
        provider, type: dispatchType,
        label: label.trim() || catalog.label,
        iconKey: catalog.iconKey, sub: catalog.sub || '',
        screen: catalog.screen || null, power: false,
        xiaomiDid: deviceId,
        xiaomiModel: catalog.model || '',
        xiaomiIp: catalog.ip || '',
        xiaomiToken: catalog.token || '',
        sourceId: deviceId, homeId,
      }
    } else {
      const activeInfoWidget = catalog.iconKey === 'cloud' || catalog.iconKey === 'clock'
      newDevice = {
        id: `wg-${deviceId}-${Date.now().toString(36)}`,
        provider, type: dispatchType,
        label: label.trim() || catalog.label,
        iconKey: catalog.iconKey, sub: catalog.sub || '',
        screen: catalog.screen || null, power: activeInfoWidget,
        sourceId: deviceId, homeId,
      }
    }
    try {
      await api.addDevice(newDevice, { homeId })
      onDeviceAdded && onDeviceAdded()
      go('main')
    } catch (e) {
      setError(e.message || '기기 추가 실패')
    } finally {
      setAdding(false)
    }
  }

  if (loading) return (
    <>
      <MobileHeader title="기기 추가" onBack={back} accent={accent}/>
      <div style={{ padding: '40px 0', textAlign: 'center', color: PALETTE.charcoal.dim, fontSize: 13 }}>불러오는 중…</div>
    </>
  )

  if (!catalog) return (
    <>
      <MobileHeader title="기기 추가" onBack={back} accent={accent}/>
      <div style={{ padding: 40, color: PALETTE.charcoal.dim, fontSize: 13, textAlign: 'center' }}>
        {error || '기기를 찾을 수 없습니다.'}
      </div>
    </>
  )

  return (
    <>
      <MobileHeader title="기기 추가" onBack={back} accent={accent}/>
      <div style={{ padding: '18px 14px 32px' }}>
        <HomeTargetNote picker={homePicker} accent={accent} r={r} compact/>
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 4, padding: '32px 18px',
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          marginBottom: 14,
        }}>
          <div style={{
            width: 76, height: 76, borderRadius: 22,
            background: accent + '22', border: `1px solid ${accent}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <DeviceIcon iconKey={catalog.iconKey} size={40} color={accent}/>
          </div>
          <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 }}>
            {provider}
          </div>
          <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, textAlign: 'center', maxWidth: 300 }}>
            {catalog.sub}
          </div>
        </div>

        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2,
          padding: '16px 18px', border: `1px solid ${PALETTE.charcoal.line}`,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim, textTransform: 'uppercase', fontWeight: 500, marginBottom: 8 }}>
            이름
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value)}
                 placeholder={catalog.label} maxLength={24} style={{
            width: '100%', background: 'transparent', border: 'none',
            color: PALETTE.charcoal.text, fontSize: 17, fontWeight: 600,
            outline: 'none', fontFamily: 'inherit', padding: 0, boxSizing: 'border-box',
          }}/>
        </div>

        {error && (
          <div style={{ color: PALETTE.charcoal.warn, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button onClick={add} disabled={adding || homePicker.loading || !targetHome} style={{
          width: '100%', minHeight: 56, borderRadius: 16,
          background: adding || homePicker.loading || !targetHome ? PALETTE.charcoal.card : accent,
          color: adding || homePicker.loading || !targetHome ? PALETTE.charcoal.dim : '#14100d',
          border: 'none', fontSize: 16, fontWeight: 700, cursor: adding ? 'wait' : 'pointer',
          letterSpacing: 0.3, fontFamily: 'inherit',
        }}>
          {adding ? '추가 중…' : `${homeName}에 추가`}
        </button>
      </div>
    </>
  )
}


// ── Xiaomi Cloud catalog ──────────────────────────────────────────────
//
// Multi-step flow distinct from SmartThings (which uses OAuth):
//   1. Show last-fetched catalog (cached on the backend) immediately if any.
//   2. "기기 동기화" → if no active session, prompt for username/password.
//   3. Backend may demand a captcha (image returned as base64) and/or
//      an email 2FA code; we surface those as inline forms.
//   4. On `state: 'ready'` the response includes the freshly fetched catalog;
//      we render and persist via the backend.
function XiaomiCatalog({ state, back, go, accent, r, onDeviceAdded, homePicker, fixedHome = false }) {
  // admin 만 카탈로그 동기화/로그인 가능. 멤버는 admin 이 가져온 카탈로그를
  // 조회만 하고 자기 홈에 추가.
  const isAdmin = api.isAdmin()
  const targetHome = homePicker.targetHome
  const targetHomeId = targetHome?.id
  const homeName = targetHome?.name || '선택 홈'
  const addedDids = new Set(
    (state.devices || [])
      .filter(d => d.provider === 'xiaomi' && deviceBelongsToHome(d, targetHomeId))
      .map(d => d.xiaomiDid)
      .filter(Boolean)
  )

  const [catalog, setCatalog] = useState([])
  const [fetchedAt, setFetchedAt] = useState(null)
  const [phase, setPhase] = useState('list')           // list | login | captcha | 2fa | busy
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [creds, setCreds] = useState({ username: '', password: '' })
  const [captchaImage, setCaptchaImage] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [addingDid, setAddingDid] = useState(null)
  const [locallyAdded, setLocallyAdded] = useState(() => new Set())

  // 초기 로드 — 캐시된 카탈로그
  useEffect(() => {
    if (homePicker.loading) return
    if (!targetHomeId) {
      setCatalog([])
      setFetchedAt(null)
      return
    }
    let alive = true
    api.xiaomiCloudCatalog({ homeId: targetHomeId }).then(({ catalog: c, fetchedAt: ts }) => {
      if (!alive) return
      setCatalog(c || [])
      setFetchedAt(ts || null)
    }).catch(() => {
      if (!alive) return
      setCatalog([])
      setFetchedAt(null)
    })
    return () => { alive = false }
  }, [homePicker.loading, targetHomeId])

  const applySnapshot = (snap) => {
    if (!snap) return
    if (snap.state === 'need_captcha') {
      setCaptchaImage(snap.captchaImage || null)
      setCode('')
      setPhase('captcha')
      setError(null)
      return
    }
    if (snap.state === 'need_2fa') {
      setCode('')
      setPhase('2fa')
      setError(null)
      setInfo('등록된 이메일로 인증 코드가 발송되었습니다.')
      return
    }
    if (snap.state === 'ready') {
      setCatalog(snap.catalog || [])
      setFetchedAt(new Date().toISOString())
      setPhase('list')
      setError(null)
      setInfo('기기 목록을 불러왔습니다.')
      return
    }
    if (snap.state === 'failed') {
      setError(snap.error || '실패했습니다. 처음부터 다시 시도하세요.')
      setPhase('login')
      return
    }
    if (snap.state === 'needs_login') {
      setPhase('login')
      return
    }
  }

  const onRefresh = async () => {
    if (homePicker.loading || !targetHome) return
    setBusy(true); setError(null); setInfo(null)
    try {
      const snap = await api.xiaomiCloudRefresh({ homeId: targetHomeId })
      if (snap.state === 'ready' || snap.state === 'need_captcha' || snap.state === 'need_2fa') {
        applySnapshot(snap)
      } else {
        // 세션 없음 / 만료 → 로그인 화면
        setPhase('login')
      }
    } catch (e) {
      setError(e.message || '재조회 실패')
      setPhase('login')
    } finally {
      setBusy(false)
    }
  }

  const onLogin = async () => {
    if (homePicker.loading || !targetHome) return
    if (!creds.username || !creds.password) {
      setError('이메일과 비밀번호를 입력하세요.')
      return
    }
    setBusy(true); setError(null); setInfo(null); setPhase('busy')
    try {
      const snap = await api.xiaomiCloudLogin(creds.username, creds.password, { homeId: targetHomeId })
      applySnapshot(snap)
    } catch (e) {
      setError(e.message || '로그인 실패')
      setPhase('login')
    } finally {
      setBusy(false)
    }
  }

  const onSubmitCaptcha = async () => {
    if (homePicker.loading || !targetHome) return
    if (!code.trim()) return
    setBusy(true); setError(null); setPhase('busy')
    try {
      const snap = await api.xiaomiCloudCaptcha(code.trim(), { homeId: targetHomeId })
      applySnapshot(snap)
    } catch (e) {
      setError(e.message || '캡챠 검증 실패')
      setPhase('login')
    } finally {
      setBusy(false)
    }
  }

  const onSubmit2FA = async () => {
    if (homePicker.loading || !targetHome) return
    if (!code.trim()) return
    setBusy(true); setError(null); setPhase('busy')
    try {
      const snap = await api.xiaomiCloud2FA(code.trim(), { homeId: targetHomeId })
      applySnapshot(snap)
    } catch (e) {
      setError(e.message || '인증 코드 검증 실패')
      setPhase('login')
    } finally {
      setBusy(false)
    }
  }

  const fmtTs = (iso) => {
    if (!iso) return '아직 불러온 적 없음'
    try {
      const d = new Date(iso)
      return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
    } catch { return iso }
  }

  // + 버튼 → 중간 페이지 없이 바로 홈에 추가. 이름은 cloud 의 device name 그대로 사용.
  const onAddDevice = async (d) => {
    if (homePicker.loading || !targetHome) return
    if (!d?.did) return
    setAddingDid(d.did); setError(null); setInfo(null)
    const newDevice = {
      id: `xiaomi-${d.did}`,
      provider: 'xiaomi',
      type: d.type || d.iconKey,
      label: d.label || d.name || 'Xiaomi 기기',
      iconKey: d.iconKey,
      sub: d.sub || '',
      screen: d.screen || null,
      power: false,
      xiaomiDid: d.did,
      xiaomiModel: d.model || '',
      xiaomiIp: d.ip || '',
      xiaomiToken: d.token || '',
      sourceId: d.did,
      homeId: targetHomeId,
    }
    try {
      await api.addDevice(newDevice, { homeId: targetHomeId })
      setLocallyAdded(s => new Set(s).add(d.did))
      onDeviceAdded && onDeviceAdded()
      setInfo(`${newDevice.label} 을(를) ${homeName}에 추가했습니다.`)
    } catch (e) {
      const msg = e?.message || '추가 실패'
      setError(/already exists/i.test(msg) ? '이미 추가된 기기입니다.' : ('추가 실패: ' + msg))
    } finally {
      setAddingDid(null)
    }
  }

  return (
    <>
      <MobileHeader title="Xiaomi Home" onBack={back} accent={accent}/>
      <div style={{ padding: '14px 14px 28px' }}>
        {!fixedHome && <HomeTargetNote picker={homePicker} accent={accent} r={r} compact/>}
        {/* status / refresh row */}
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2,
          border: `1px solid ${PALETTE.charcoal.line}`,
          padding: '12px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: PALETTE.charcoal.text, fontWeight: 600 }}>
              {homeName} 기기 목록 · {catalog.length}
            </div>
            <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 3 }}>
              마지막 동기화: {fmtTs(fetchedAt)}
            </div>
          </div>
          {isAdmin && (
            <button onClick={onRefresh} disabled={homePicker.loading || !targetHome || busy || phase === 'captcha' || phase === '2fa'} style={{
              height: 36, padding: '0 14px', borderRadius: 10,
              background: accent, color: '#1a1a1a', border: 'none',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
            }}>
              {busy && phase !== 'login' ? '…' : '기기 동기화'}
            </button>
          )}
        </div>

        {info && (
          <div style={{
            padding: '10px 14px', marginBottom: 10, borderRadius: 10,
            background: accent + '14', border: `1px solid ${accent}33`,
            color: PALETTE.charcoal.text, fontSize: 12,
          }}>{info}</div>
        )}
        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 10, borderRadius: 10,
            background: '#2a1a1a', border: `1px solid ${PALETTE.charcoal.warn}44`,
            color: PALETTE.charcoal.warn, fontSize: 12,
          }}>{error}</div>
        )}

        {isAdmin && phase === 'login' && (
          <XiaomiLoginForm creds={creds} setCreds={setCreds} onSubmit={onLogin} busy={busy}
            accent={accent} r={r}/>
        )}

        {isAdmin && phase === 'captcha' && (
          <XiaomiCodeForm
            title="캡챠 입력"
            hint="아래 이미지에 표시된 문자(대소문자 구분)를 입력하세요."
            image={captchaImage}
            code={code} setCode={setCode}
            onSubmit={onSubmitCaptcha} busy={busy}
            accent={accent} r={r}/>
        )}

        {isAdmin && phase === '2fa' && (
          <XiaomiCodeForm
            title="이메일 인증 코드"
            hint="등록된 이메일로 받은 인증 코드를 입력하세요."
            code={code} setCode={setCode}
            onSubmit={onSubmit2FA} busy={busy}
            accent={accent} r={r}/>
        )}

        {phase === 'busy' && (
          <div style={{ padding: 28, textAlign: 'center', color: PALETTE.charcoal.dim, fontSize: 13 }}>
            처리 중…
          </div>
        )}

        {phase === 'list' && catalog.length === 0 && (
          <div style={{
            padding: '32px 18px', textAlign: 'center',
            background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px dashed ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.dim, fontSize: 13,
          }}>
            {isAdmin ? (
              <>{homeName}에 동기화된 Xiaomi 기기가 없습니다. <br/>"기기 동기화"를 눌러 클라우드에서 가져오세요.</>
            ) : (
              <>{homeName}에 동기화된 Xiaomi 기기가 없습니다. <br/>관리자에게 기기 동기화를 요청하세요.</>
            )}
          </div>
        )}

        {phase === 'list' && catalog.length > 0 && (
          <>
            <div style={{ fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim, textTransform: 'uppercase', fontWeight: 500, padding: '6px 4px 12px' }}>
              {homeName}에서 발견된 기기 · {catalog.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catalog.map(d => {
                const added = d.alreadyAdded || addedDids.has(d.did) || locallyAdded.has(d.did)
                const supported = d.supported && !added
                const adding = addingDid === d.did
                const reason = !d.supported
                  ? '미지원 기기'
                  : !d.ip || !d.token ? 'IP/토큰 없음'
                  : added ? '추가됨' : null
                const clickable = supported && !adding
                return (
                  <button key={d.did}
                    onClick={() => clickable && onAddDevice(d)}
                    disabled={!clickable}
                    style={{
                      background: PALETTE.charcoal.card, borderRadius: r,
                      padding: '14px 16px', border: `1px solid ${PALETTE.charcoal.line}`,
                      display: 'flex', alignItems: 'center', gap: 12,
                      cursor: clickable ? 'pointer' : (adding ? 'wait' : 'default'),
                      textAlign: 'left',
                      color: supported ? PALETTE.charcoal.text : PALETTE.charcoal.dim,
                      minHeight: 68, opacity: supported ? 1 : 0.55,
                      fontFamily: 'inherit',
                    }}>
                    <DeviceIcon iconKey={d.iconKey} size={24} color={supported ? accent : PALETTE.charcoal.dim}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.label || d.name}
                      </div>
                      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.sub}
                      </div>
                    </div>
                    {adding ? (
                      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, letterSpacing: 0.6, fontWeight: 600 }}>
                        추가 중…
                      </div>
                    ) : reason ? (
                      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, letterSpacing: 0.6, fontWeight: 600 }}>
                        {reason}
                      </div>
                    ) : (
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, background: accent + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}><IconPlus size={16} color={accent}/></div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function XiaomiLoginForm({ creds, setCreds, onSubmit, busy, accent, r }) {
  return (
    <div style={{
      background: PALETTE.charcoal.card, borderRadius: r + 2,
      border: `1px solid ${PALETTE.charcoal.line}`,
      padding: '16px 18px', marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim, textTransform: 'uppercase', fontWeight: 500, marginBottom: 10 }}>
        Xiaomi 계정 로그인
      </div>
      <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginBottom: 14, lineHeight: 1.5 }}>
        Mi 계정 정보는 백엔드에 저장되지 않으며, 클라우드 토큰 추출 1회 사용 후 폐기됩니다.
      </div>
      <input value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })}
        placeholder="이메일 또는 사용자 ID" autoComplete="username"
        style={inputStyle()}/>
      <input value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })}
        placeholder="비밀번호" type="password" autoComplete="current-password"
        style={{ ...inputStyle(), marginTop: 8 }}/>
      <button onClick={onSubmit} disabled={busy} style={primaryButton(accent, busy)}>
        {busy ? '로그인 중…' : '로그인'}
      </button>
    </div>
  )
}

function XiaomiCodeForm({ title, hint, image, code, setCode, onSubmit, busy, accent, r }) {
  return (
    <div style={{
      background: PALETTE.charcoal.card, borderRadius: r + 2,
      border: `1px solid ${PALETTE.charcoal.line}`,
      padding: '16px 18px', marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim, textTransform: 'uppercase', fontWeight: 500, marginBottom: 8 }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginBottom: 12, lineHeight: 1.5 }}>{hint}</div>
      )}
      {image && (
        <div style={{ marginBottom: 12, padding: 8, background: '#fff', borderRadius: 8, display: 'flex', justifyContent: 'center' }}>
          <img src={`data:image/jpeg;base64,${image}`} alt="captcha"
               style={{ maxHeight: 80, imageRendering: 'pixelated' }}/>
        </div>
      )}
      <input value={code} onChange={(e) => setCode(e.target.value)}
        placeholder="코드 입력" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
        style={inputStyle()}/>
      <button onClick={onSubmit} disabled={busy || !code.trim()} style={primaryButton(accent, busy || !code.trim())}>
        {busy ? '확인 중…' : '확인'}
      </button>
    </div>
  )
}

function inputStyle() {
  return {
    width: '100%', boxSizing: 'border-box',
    background: '#17130f', border: `1px solid ${PALETTE.charcoal.line}`,
    borderRadius: 10, padding: '12px 14px', color: PALETTE.charcoal.text,
    fontSize: 14, fontFamily: 'inherit', outline: 'none',
  }
}

function primaryButton(accent, disabled) {
  return {
    width: '100%', minHeight: 48, marginTop: 14, borderRadius: 12,
    background: disabled ? '#1a1612' : accent,
    color: disabled ? PALETTE.charcoal.dim : '#14100d',
    border: 'none', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
