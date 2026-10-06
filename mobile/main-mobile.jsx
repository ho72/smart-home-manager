import { useEffect, useState } from 'react'
import { PALETTE, useClock, fmtTime, IconFan, IconBulb, IconAC, IconHumid, IconThermo, IconSensor, IconBolt, IconBlind, IconHome, IconMoon, IconLeaf, IconFilm, IconSparkle, IconChevron, IconSettings, IconClock, IconButton, IconCloud, IconWind, IconScale, Spinner } from '../components/shared'
import { MobileToggle } from './shared-mobile'
import { Reorderable } from './reorderable'
import { api } from '../src/api.js'

// Scene 아이콘 매핑 — 자동화 편집기의 아이콘 픽커도 같은 키 셋을 사용.
// 새 키 추가 시 SCENE_ICON_OPTIONS (automations-mobile.jsx) 도 같이 갱신.
export const SCENE_ICON_BY_KEY = {
  home: IconHome, moon: IconMoon, leaf: IconLeaf, film: IconFilm,
  sparkle: IconSparkle, bolt: IconBolt, cloud: IconCloud,
  fan: IconFan, bulb: IconBulb, button: IconButton,
}

export function MainMobile({ state, setState, go, tweaks, runAutomation, onToggleDevice, onRemoveDevice, onSaveAutomations, devicesLoading, layoutReady = true, desktopShell = false }) {
  const t = useClock();

  // Homes — needed for layout grouping and home name badges.
  const [homes, setHomes] = useState([])
  useEffect(() => {
    api.homes().then(data => setHomes(data?.homes || [])).catch(() => {})
  }, [])
  const homeMap = Object.fromEntries(homes.map(h => [h.id, h.name]))
  const hasMultipleHomes = homes.length > 1
  const mainLayout = tweaks.mainLayout || 'free'
  const showCardHomeMeta = hasMultipleHomes && mainLayout === 'free'
  const { hm, ap } = fmtTime(t);
  const r = tweaks.radius;
  const accent = tweaks.accent;
  const { devices, scene } = state;
  const setScene = (s) => setState({ ...state, scene: s });
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState(null);  // for tabbed layout

  // 홈 헤더 상단 라벨에 표시할 현재 기온. weather widget 이 홈 타일에 있으면
  // 그 값을 재사용 (10초 폴링으로 최신), 없으면 독립적으로 5분마다 fetch.
  const widgetWeather = devices.find(d => d.iconKey === 'cloud')?.weather
  const [topWeather, setTopWeather] = useState(null)
  useEffect(() => {
    if (widgetWeather) return  // widget 있으면 별도 fetch 불필요
    let cancelled = false
    const fetchOnce = () => api.getWeatherCurrent()
      .then(w => { if (!cancelled) setTopWeather(w) })
      .catch(() => {})
    fetchOnce()
    const id = setInterval(fetchOnce, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [widgetWeather ? 'widget' : 'standalone'])
  const headerWeather = widgetWeather || topWeather
  const headerTempLabel = headerWeather ? `홈 · ${Math.round(headerWeather.temp)}°` : '홈'

  // Scene buttons — 모두 button-trigger 자동화에서 옴. 기본 4개(홈/취침/외출/영화)도
  // 백엔드에서 시드된 진짜 automation 으로 관리되어 관리 페이지에서 편집 가능.
  // a.iconKey 로 아이콘 컴포넌트 매핑.
  const buttonAutomations = (state.automations || []).filter(a => a.trigger === 'button');
  const allScenes = buttonAutomations.map(a => ({
    id: 'auto-' + a.id, k: 'auto-' + a.id,
    ico: SCENE_ICON_BY_KEY[a.iconKey] || IconSparkle,
    label: a.name || '씬',
    automationId: a.id,
  }));

  // 홈 하단 자동화 리스트는 버튼 트리거(상단 씬 버튼으로 이미 노출됨)는 제외.
  // 관리 페이지에선 트리거 종류와 무관하게 전체가 보이고 편집 가능.
  const allAutomations = state.automations || [];
  const automations = allAutomations.filter(a => a.trigger !== 'button');
  const activeCount = automations.filter(a => a.enabled).length;

  // Build device entries
  const deviceEntries = devices.map(d => {
    const isAlwaysActiveWidget = d.provider === 'widgets' && (d.iconKey === 'cloud' || d.iconKey === 'clock');
    const on = isAlwaysActiveWidget ? true : d.power;
    const isBlind = d.iconKey === 'blind';
    const offline = !!d._error && !d._syncing;
    return {
      id: d.id,
      label: d.label,
      Icon: d.iconKey === 'fan' ? IconFan :
            d.iconKey === 'bulb' ? IconBulb :
            d.iconKey === 'ac' ? IconAC :
            d.iconKey === 'humid' ? IconHumid :
            d.iconKey === 'thermo' ? IconThermo :
            d.iconKey === 'sensor' ? IconSensor :
            d.iconKey === 'blind' ? IconBlind :
            d.iconKey === 'wind' ? IconWind :
            d.iconKey === 'scale' ? IconScale :
            d.iconKey === 'clock' ? IconClock :
            IconBolt,
      on,
      sub: offline
        ? '동기화 실패 · 오프라인'
        : d.provider === 'widgets'
          ? (d.sub || '')
          : isBlind
            ? (d.sub || '닫힘')
            : (on ? (d.sub || '동작 중') : '꺼짐'),
      // Blinds 와 widgets(weather/clock 등) 는 토글 없음 — 탭하면 디테일 페이지로
      toggle: (isBlind || d.provider === 'widgets') ? null : () => {
        if (onToggleDevice) {
          onToggleDevice(d.id, on, d.provider)
        } else {
          const next = devices.map(x => x.id === d.id ? { ...x, power: !x.power } : x)
          setState({ ...state, devices: next })
        }
      },
      anim: on,
      iconKey: d.iconKey,
      level: d.level,
      click: d.screen ? () => go(d.screen + ':' + d.id) : undefined,
      provider: d.provider,
      weather: d.weather,  // weather widget 의 백엔드 응답 (있는 경우만)
      syncing: !!d._syncing,
      offline,
      homeId: d.homeId,
      homeName: showCardHomeMeta && d.homeId ? homeMap[d.homeId] || null : null,
    };
  });

  const sceneOrder = state.sceneOrder || allScenes.map(s => s.id);
  const deviceOrder = state.deviceOrder || deviceEntries.map(d => d.id);
  const autoOrder = state.automationOrder || automations.map(a => a.id);
  const deviceLayoutPending = !layoutReady && !state.deviceOrder;

  // 순서 변경은 React state 즉시 갱신 + 백엔드 settings 에도 영속화 (다음 세션에 복원).
  const setSceneOrder = (ids) => {
    setState({ ...state, sceneOrder: ids });
    api.saveSettings({ sceneOrder: ids }).catch(() => {});
  };
  const setDeviceOrder = (ids) => {
    setState({ ...state, deviceOrder: ids });
    api.saveSettings({ deviceOrder: ids }).catch(() => {});
  };
  const setAutoOrder = (ids) => {
    setState({ ...state, automationOrder: ids });
    api.saveSettings({ automationOrder: ids }).catch(() => {});
  };

  return (
    <>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '14px 18px 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        background: 'rgba(20,16,13,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.6, color: PALETTE.charcoal.dim, textTransform: 'uppercase', fontWeight: 500 }}>
            {editing ? '레이아웃 편집' : headerTempLabel}
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 2, letterSpacing: -0.5 }}>
            {editing ? '재배치' : <>{hm}<span style={{ fontSize: 14, color: PALETTE.charcoal.dim, marginLeft: 5, fontWeight: 500 }}>{ap}</span></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditing(e => !e)} aria-label={editing ? '완료' : '편집'} style={{
            height: 48, minWidth: 48, padding: editing ? '0 18px' : 0, borderRadius: 14,
            background: editing ? accent : PALETTE.charcoal.card,
            border: editing ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
            color: editing ? '#14100d' : PALETTE.charcoal.text,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {editing ? '완료' : <IconEdit size={20} color={PALETTE.charcoal.text}/>}
          </button>
          {!editing && (
            <>
              <button onClick={() => go('chat')} aria-label="채팅" style={{
                width: 48, height: 48, borderRadius: 14,
                background: PALETTE.charcoal.card,
                border: `1px solid ${PALETTE.charcoal.line}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconChat size={22} color={PALETTE.charcoal.text}/>
              </button>
              {!desktopShell && (
                <button onClick={() => go('settings')} aria-label="설정" style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: PALETTE.charcoal.card,
                  border: `1px solid ${PALETTE.charcoal.line}`,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconSettings size={22} color={PALETTE.charcoal.text}/>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {editing && (
        <div style={{
          margin: '8px 14px 0', padding: '10px 14px',
          background: accent + '18', border: `1px solid ${accent}44`,
          borderRadius: 12, fontSize: 12, color: PALETTE.charcoal.text,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <IconBolt size={14} color={accent}/>
          <span style={{ flex: 1, lineHeight: 1.4 }}>타일을 길게 누른 뒤 드래그해 같은 섹션 안에서 위치를 바꿀 수 있어요.</span>
        </div>
      )}

      {/* SCENES — reorderable row */}
      <SectionLabel>씬</SectionLabel>
      <div style={{ padding: '0 14px 6px' }}>
        <Reorderable
          items={allScenes}
          order={sceneOrder}
          onReorder={setSceneOrder}
          editing={editing}
          layout="grid4"
          gap={6}
          renderItem={(s, { dragging, editing: ed }) => (
            <SceneButton s={s} scene={scene} setScene={setScene}
              runAutomation={runAutomation} accent={accent} editing={ed}/>
          )}/>
      </div>

      {/* DEVICES — layout-aware */}
      <DeviceSection
        deviceEntries={deviceEntries}
        deviceOrder={deviceOrder}
        setDeviceOrder={setDeviceOrder}
        devicesLoading={devicesLoading}
        deviceLayoutPending={deviceLayoutPending}
        mainLayout={mainLayout}
        homes={homes}
        homeMap={homeMap}
        editing={editing}
        accent={accent}
        r={r}
        onRemoveDevice={onRemoveDevice}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Status strip */}
      {!editing && (
        <div style={{
          margin: '0 14px 16px',
          height: 48, borderRadius: 12,
          background: PALETTE.charcoal.card,
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex', alignItems: 'center',
          padding: '0 16px',
          fontSize: 12, color: PALETTE.charcoal.dim,
          justifyContent: 'space-between',
          whiteSpace: 'nowrap',
        }}>
          <span>{deviceEntries.filter(d => d.on).length}/{deviceEntries.length}개 켜짐</span>
          <span style={{ color: PALETTE.charcoal.on, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PALETTE.charcoal.on }}/>
            동기화됨
          </span>
        </div>
      )}

      {/* AUTOMATIONS — reorderable list */}
      <SectionLabel right={!editing && (
        <button onClick={() => go('automations')} style={{
          background: 'transparent', border: 'none',
          color: accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.4,
          padding: '4px 6px',
        }}>관리 →</button>
      )}>자동화 · {activeCount}개 활성</SectionLabel>
      <div style={{ padding: '0 14px 32px' }}>
        <div style={{ background: PALETTE.charcoal.card, borderRadius: 14, border: `1px solid ${PALETTE.charcoal.line}`, overflow: 'hidden' }}>
          {automations.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: PALETTE.charcoal.dim, fontSize: 12 }}>
              아직 자동화가 없어요. 관리를 눌러 만들어 보세요.
            </div>
          ) : (
            <Reorderable
              items={automations}
              order={autoOrder}
              onReorder={setAutoOrder}
              editing={editing}
              layout="list"
              gap={0}
              renderItem={(a, { editing: ed }) => (
                <AutomationRow a={a} accent={accent} editing={ed}
                  onToggle={(e) => { e.stopPropagation();
                    // 토글은 전체 자동화 리스트(button 트리거 포함)를 갱신해야 한다 —
                    // 필터된 `automations` 만 쓰면 button 트리거가 통째로 사라짐.
                    const next = allAutomations.map(x => x.id === a.id ? { ...x, enabled: !x.enabled } : x);
                    if (onSaveAutomations) onSaveAutomations(next)
                    else setState({ ...state, automations: next })
                  }}/>
              )}/>
          )}
        </div>
      </div>
    </>
  );
}

function DeviceSection({
  deviceEntries, deviceOrder, setDeviceOrder, devicesLoading, deviceLayoutPending,
  mainLayout, homes, homeMap, editing, accent, r, onRemoveDevice, activeTab, setActiveTab,
}) {
  const syncBadge = devicesLoading && deviceEntries.length > 0 && (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: PALETTE.charcoal.dim, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 500 }}>
      <Spinner color={accent} size={10}/> 동기화 중
    </span>
  )

  const renderTile = (d, ed) => {
    const onRemove = (e) => {
      e.stopPropagation()
      if (!onRemoveDevice) return
      if (confirm(`"${d.label}" 을(를) 홈에서 제거할까요?`)) onRemoveDevice(d.id)
    }
    if (d.provider === 'widgets' && d.iconKey === 'cloud') {
      return <MobileWeatherTile d={d} accent={accent} r={r} editing={ed} onRemove={onRemove}/>
    }
    if (d.provider === 'widgets' && d.iconKey === 'clock') {
      return <MobileClockTile d={d} accent={accent} r={r} editing={ed} onRemove={onRemove}/>
    }
    return <MobileDeviceTile d={d} accent={accent} r={r} editing={ed} onRemove={onRemove}/>
  }

  const renderGrid = (entries, order, onReorder) => (
    <Reorderable items={entries} order={order} onReorder={onReorder}
      editing={editing} layout="grid2" gap={10}
      renderItem={(d, { editing: ed }) => renderTile(d, ed)}/>
  )

  if (deviceLayoutPending || (deviceEntries.length === 0 && devicesLoading)) {
    return (
      <>
        <SectionLabel>기기</SectionLabel>
        <div style={{ padding: '0 14px 10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SkeletonTile r={r} accent={accent}/>
            <SkeletonTile r={r} accent={accent}/>
          </div>
        </div>
      </>
    )
  }

  if (deviceEntries.length === 0) {
    return (
      <>
        <SectionLabel>기기</SectionLabel>
        <div style={{ padding: '0 14px 10px' }}>
          <div style={{ padding: '28px 20px', textAlign: 'center',
            background: PALETTE.charcoal.card, borderRadius: r + 2,
            border: `1px dashed ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.dim, fontSize: 13,
          }}>
            아직 기기가 없어요. 설정 → 위젯에서 추가하세요.
          </div>
        </div>
      </>
    )
  }

  // ── free: all mixed ─────────────────────────────────────────────────────────
  if (mainLayout === 'free') {
    return (
      <>
        <SectionLabel right={syncBadge}>기기</SectionLabel>
        <div style={{ padding: '0 14px 10px' }}>
          {renderGrid(deviceEntries, deviceOrder, setDeviceOrder)}
        </div>
      </>
    )
  }

  // Group by homeId for sectioned / tabbed
  const homeOrder = []
  const grouped = {}
  for (const d of deviceEntries) {
    const key = d.homeId || '__none__'
    if (!grouped[key]) { grouped[key] = []; homeOrder.push(key) }
    grouped[key].push(d)
  }
  const groupKeys = [...new Set(homeOrder)]  // preserve first-seen order, dedupe

  // ── sectioned ───────────────────────────────────────────────────────────────
  if (mainLayout === 'sectioned') {
    return (
      <>
        {groupKeys.map(key => {
          const label = key === '__none__' ? '기기' : (homeMap[key] || '기기')
          const entries = grouped[key]
          const subOrder = deviceOrder.filter(id => entries.some(e => e.id === id))
          return (
            <div key={key}>
              <SectionLabel right={key === groupKeys[0] ? syncBadge : null}>{label}</SectionLabel>
              <div style={{ padding: '0 14px 10px' }}>
                {renderGrid(entries, subOrder, (ids) => {
                  // merge sub-order back into full device order
                  const rest = deviceOrder.filter(id => !ids.includes(id) && !entries.some(e => e.id === id))
                  setDeviceOrder([...ids, ...rest])
                })}
              </div>
            </div>
          )
        })}
      </>
    )
  }

  // ── tabbed ──────────────────────────────────────────────────────────────────
  const validTab = groupKeys.includes(activeTab) ? activeTab : groupKeys[0]
  const tabEntries = grouped[validTab] || []
  const tabOrder = deviceOrder.filter(id => tabEntries.some(e => e.id === id))

  return (
    <>
      <SectionLabel right={syncBadge}>기기</SectionLabel>
      <div style={{ padding: '0 14px 6px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {groupKeys.map(key => {
          const label = key === '__none__' ? '전체' : (homeMap[key] || '홈')
          const sel = key === validTab
          return (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              height: 30, padding: '0 14px', borderRadius: 999, border: 'none',
              background: sel ? accent : PALETTE.charcoal.card,
              color: sel ? '#14100d' : PALETTE.charcoal.dim,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              boxShadow: sel ? 'none' : `inset 0 0 0 1px ${PALETTE.charcoal.line}`,
            }}>{label}</button>
          )
        })}
      </div>
      <div style={{ padding: '0 14px 10px' }}>
        {renderGrid(tabEntries, tabOrder, (ids) => {
          const rest = deviceOrder.filter(id => !ids.includes(id) && !tabEntries.some(e => e.id === id))
          setDeviceOrder([...ids, ...rest])
        })}
      </div>
    </>
  )
}


function SkeletonTile({ r, accent }) {
  return (
    <div style={{
      background: PALETTE.charcoal.card,
      borderRadius: r + 2, padding: '16px',
      border: `1px solid ${PALETTE.charcoal.line}`,
      minHeight: 172, position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(110deg, transparent 30%, ${accent}11 50%, transparent 70%)`,
        animation: 'shimmer 1.6s linear infinite',
        backgroundSize: '200% 100%',
      }}/>
      <Spinner color={accent} size={20}/>
    </div>
  );
}

export function SectionLabel({ children, right }) {
  return (
    <div style={{
      padding: '14px 18px 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim, textTransform: 'uppercase', fontWeight: 500 }}>
        {children}
      </div>
      {right}
    </div>
  );
}

export function IconChat({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>
    </svg>
  );
}

export function IconEdit({ size = 20, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <path d="M4 20 L4 16 L16 4 L20 8 L8 20 Z M14 6 L18 10"
            fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconGrip({ size = 14, color = '#5a4e42' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <circle cx="9" cy="6" r="1.6" fill={color}/>
      <circle cx="15" cy="6" r="1.6" fill={color}/>
      <circle cx="9" cy="12" r="1.6" fill={color}/>
      <circle cx="15" cy="12" r="1.6" fill={color}/>
      <circle cx="9" cy="18" r="1.6" fill={color}/>
      <circle cx="15" cy="18" r="1.6" fill={color}/>
    </svg>
  );
}

const _SENSOR_FIELD_LABELS = { aqi: 'AQI', temperature: '온도', humidity: '습도' };
const _SENSOR_FIELD_UNITS  = { aqi: '', temperature: '°', humidity: '%' };

export function summarizeAutomation(a) {
  const actions = (a.actions || []).map(x => x.label || x.deviceLabel).filter(Boolean).join(' · ') || '동작 없음';
  if (a.trigger === 'time') return `${a.triggerTime || '--:--'} → ${actions}`;
  if (a.trigger === 'sensor') {
    const ts = a.triggerSensor || {};
    const f = _SENSOR_FIELD_LABELS[ts.field] || ts.field || '센서';
    const u = _SENSOR_FIELD_UNITS[ts.field] || '';
    return `${f} ${ts.op || '>'} ${ts.value ?? 0}${u} → ${actions}`;
  }
  return `버튼 탭 → ${actions}`;
}

function SceneButton({ s, scene, setScene, runAutomation, accent, editing }) {
  const sel = scene === s.k;
  const onTap = () => {
    if (editing) return;
    if (s.automationId) runAutomation(s.automationId);
    else setScene(scene === s.k ? null : s.k);
  };
  return (
    <button onClick={onTap} style={{
      width: '100%',
      height: 58, borderRadius: 14,
      background: sel ? accent : PALETTE.charcoal.card,
      border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
      color: sel ? '#14100d' : PALETTE.charcoal.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 3, cursor: editing ? 'grab' : 'pointer',
      flexShrink: 0, position: 'relative',
    }}>
      <s.ico size={17} color={sel ? '#14100d' : PALETTE.charcoal.text}/>
      <span style={{ fontSize: 10, letterSpacing: 0.5, fontWeight: 600, maxWidth: '95%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
      {editing && (
        <div style={{ position: 'absolute', top: 4, right: 4, opacity: 0.7 }}>
          <IconGrip size={10} color={sel ? '#14100d' : PALETTE.charcoal.dim}/>
        </div>
      )}
    </button>
  );
}

export function MobileDeviceTile({ d, accent, r, editing, onRemove }) {
  const offline = !!d.offline
  return (
    <div onClick={!editing ? d.click : undefined} style={{
      background: PALETTE.charcoal.card,
      borderRadius: r + 2, padding: '16px',
      border: `1px solid ${offline ? PALETTE.charcoal.warn + '55'
                          : d.on ? accent + '55'
                          : PALETTE.charcoal.line}`,
      position: 'relative', cursor: editing ? 'grab' : (d.click ? 'pointer' : 'default'),
      minHeight: 172, overflow: 'hidden',
      WebkitTapHighlightColor: 'transparent',
      opacity: offline ? 0.78 : 1,
    }}>
      {/* 좌상단: 동기화 중 스피너 (per-tile) → 끝나면 사라짐.
          동기화 실패 시엔 X 표시(작은 점)로 대체. */}
      {d.syncing ? (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 2,
          width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Spinner color={accent} size={12}/>
        </div>
      ) : offline ? (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 2,
          width: 6, height: 6, borderRadius: 3, background: PALETTE.charcoal.warn,
        }} title={d._error || '동기화 실패'}/>
      ) : null}
      {d.on && !offline && (
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 140, height: 140, borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}/>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <d.Icon size={34} color={d.on && !offline ? accent : PALETTE.charcoal.dimDeep}
                spinning={d.iconKey === 'fan' && d.anim && !offline}
                glow={d.iconKey === 'bulb' && d.anim && !offline}
                level={d.iconKey === 'blind' ? (d.level ?? 0) : undefined}/>
        {editing ? (
          // edit 모드: 우상단 corner 에 X 삭제 배지가 별도로 absolute 배치됨.
          // 토글/그립은 자리만 차지하지 않도록 빈 노드.
          null
        ) : d.iconKey === 'blind' ? (
          <div style={{
            minWidth: 44, height: 24, padding: '0 8px',
            borderRadius: 999,
            background: d.on ? accent + '22' : '#1a1612',
            border: `1px solid ${d.on ? accent + '55' : PALETTE.charcoal.line}`,
            color: d.on ? accent : PALETTE.charcoal.dim,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
          }}>{Math.round(d.level ?? 0)}%</div>
        ) : d.toggle ? (
          <MobileToggle on={d.on && !offline} accent={accent} onToggle={(e) => { e.stopPropagation(); d.toggle(); }}/>
        ) : null}
      </div>
      {d.homeName && (
        <HomeMeta name={d.homeName} accent={accent}/>
      )}
      <div style={{ marginTop: d.homeName ? 7 : 20, fontSize: 17, fontWeight: 600, color: PALETTE.charcoal.text }}>{d.label}</div>
      <div style={{ fontSize: 11, color: offline ? PALETTE.charcoal.warn : PALETTE.charcoal.dim, marginTop: 3 }}>{d.sub}</div>
      {d.click && !editing && (
        <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
          <IconChevron size={14} color={PALETTE.charcoal.dim}/>
        </div>
      )}
      {editing && onRemove && <RemoveBadge onClick={onRemove}/>}
    </div>
  );
}

function HomeMeta({ name, accent }) {
  return (
    <div style={{
      marginTop: 18,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      maxWidth: 'calc(100% - 18px)',
      minWidth: 0,
      color: PALETTE.charcoal.dim,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: 0,
      lineHeight: 1.2,
      verticalAlign: 'top',
    }}>
      <IconHome size={11} color={accent}/>
      <span style={{
        display: 'block',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>{name}</span>
    </div>
  )
}

// 우상단의 X 삭제 배지. edit 모드에서만 보이며 reorder 의 long-press 와 충돌하지
// 않도록 pointerdown 단계에서 stopPropagation 한다.
export function RemoveBadge({ onClick }) {
  const stop = (e) => e.stopPropagation()
  return (
    <button
      onPointerDown={stop}
      onTouchStart={stop}
      onMouseDown={stop}
      onClick={onClick}
      aria-label="제거"
      style={{
        position: 'absolute', top: 8, right: 8, zIndex: 3,
        width: 26, height: 26, borderRadius: 13,
        background: PALETTE.charcoal.warn,
        border: 'none', color: '#14100d',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
      }}>
      <svg width="14" height="14" viewBox="0 0 24 24">
        <path d="M6 6 L18 18 M18 6 L6 18" stroke="#14100d" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      </svg>
    </button>
  );
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatWidgetClock(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function formatWidgetDate(date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

function formatWidgetWeekday(date) {
  return date.toLocaleDateString('ko-KR', { weekday: 'long' })
}

function formatUpdated(epoch) {
  if (!epoch) return ''
  const d = new Date(epoch * 1000)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function weatherTone(icon, accent) {
  if (icon === 'rain') return '#66a9d6'
  if (icon === 'snow') return '#d7e9f3'
  if (icon === 'cloud') return '#a8b0b8'
  if (icon === 'partly') return '#d9b35f'
  return accent
}

function WeatherGlyph({ icon, color, size = 30 }) {
  const stroke = color
  const showSun = icon === 'sun' || icon === 'partly'
  const showCloud = icon !== 'sun'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
      {showSun && (
        <>
          <circle cx={icon === 'partly' ? 13 : 16} cy={icon === 'partly' ? 12 : 16} r="5.2"
                  fill="none" stroke={stroke} strokeWidth="1.8"/>
          {[
            [16, 3.5, 16, 6.2], [16, 25.8, 16, 28.5],
            [3.5, 16, 6.2, 16], [25.8, 16, 28.5, 16],
            [7.2, 7.2, 9.1, 9.1], [22.9, 22.9, 24.8, 24.8],
            [24.8, 7.2, 22.9, 9.1], [9.1, 22.9, 7.2, 24.8],
          ].map((p, i) => (
            <line key={i} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]}
                  stroke={stroke} strokeWidth="1.6" strokeLinecap="round"/>
          ))}
        </>
      )}
      {showCloud && (
        <path d="M10 23 C7 23, 5.4 21.3, 5.4 19.2 C5.4 17.1, 7.2 15.4, 9.4 15.4 C10.1 12.4, 12.6 10.4, 15.7 10.4 C18.1 10.4, 20.2 11.7, 21.3 13.9 C24.4 14.1, 26.6 16, 26.6 18.6 C26.6 21.2, 24.5 23, 21.4 23 Z"
              fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
      )}
      {icon === 'rain' && (
        <>
          <line x1="12" y1="25.8" x2="10.7" y2="29" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="17" y1="25.8" x2="15.7" y2="29" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="22" y1="25.8" x2="20.7" y2="29" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
        </>
      )}
      {icon === 'snow' && (
        <path d="M16 25 L16 30 M13.8 26.2 L18.2 28.8 M18.2 26.2 L13.8 28.8"
              fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
      )}
    </svg>
  )
}

export function MobileClockTile({ d, accent, r, editing, onRemove }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const offline = !!d.offline

  return (
    <div onClick={!editing ? d.click : undefined} style={{
      background: PALETTE.charcoal.card,
      borderRadius: r + 2,
      padding: '16px',
      border: `1px solid ${offline ? PALETTE.charcoal.warn + '55' : accent + '55'}`,
      position: 'relative',
      cursor: editing ? 'grab' : (d.click ? 'pointer' : 'default'),
      minHeight: 172,
      height: 172,
      overflow: 'hidden',
      WebkitTapHighlightColor: 'transparent',
      display: 'flex',
      flexDirection: 'column',
      opacity: offline ? 0.78 : 1,
    }}>
      {d.syncing ? (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
          <Spinner color={accent} size={12}/>
        </div>
      ) : offline ? (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 2,
          width: 6, height: 6, borderRadius: 3, background: PALETTE.charcoal.warn,
        }}/>
      ) : null}
      {!offline && (
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 140, height: 140, borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}/>
      )}

      <div style={{
        fontSize: 13,
        color: PALETTE.charcoal.dim,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        paddingRight: d.click && !editing ? 18 : 0,
      }}>
        {formatWidgetDate(now)}
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        minHeight: 0,
      }}>
        <div style={{
          fontSize: 46,
          lineHeight: 0.95,
          fontWeight: 600,
          letterSpacing: 0,
          fontVariantNumeric: 'tabular-nums',
          color: PALETTE.charcoal.text,
          whiteSpace: 'nowrap',
        }}>
          {formatWidgetClock(now)}
        </div>
        <div style={{
          marginTop: 8,
          color: offline ? PALETTE.charcoal.warn : PALETTE.charcoal.dim,
          fontSize: 12,
          fontWeight: 700,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          paddingRight: d.click && !editing ? 18 : 0,
        }}>
          {formatWidgetWeekday(now)}
        </div>
      </div>

      {d.click && !editing && (
        <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
          <IconChevron size={14} color={PALETTE.charcoal.dim}/>
        </div>
      )}
      {editing && onRemove && <RemoveBadge onClick={onRemove}/>}
    </div>
  )
}

export function MobileWeatherTile({ d, accent, r, editing, onRemove }) {
  const w = d.weather  // { temp, humidity, windSpeed, rain1h, sky, skyText, pty, ptyText, icon }
  const hasData = !!w
  const offline = !!d.offline
  const tone = weatherTone(w?.icon, accent)
  const temp = hasData && Number.isFinite(Number(w.temp)) ? `${Math.round(Number(w.temp))}°` : '—'
  const condition = hasData ? (w.pty > 0 ? w.ptyText : w.skyText) : (offline ? '동기화 실패' : '대기 중')
  const locationLabel = w?.locationName || '현재 위치'
  const tmax = Number(w?.today?.tmax)
  const tmin = Number(w?.today?.tmin)
  const highLow = Number.isFinite(tmax) && Number.isFinite(tmin)
    ? `최고 ${Math.round(tmax)}°  최저 ${Math.round(tmin)}°`
    : ''

  return (
    <div onClick={!editing ? d.click : undefined} style={{
      background: PALETTE.charcoal.card,
      borderRadius: r + 2,
      padding: '16px',
      border: `1px solid ${offline ? PALETTE.charcoal.warn + '55' : accent + '55'}`,
      position: 'relative',
      cursor: editing ? 'grab' : (d.click ? 'pointer' : 'default'),
      minHeight: 172,
      height: 172,
      overflow: 'hidden',
      WebkitTapHighlightColor: 'transparent',
      display: 'flex', flexDirection: 'column',
      opacity: offline ? 0.78 : 1,
    }}>
      {d.syncing ? (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
          <Spinner color={accent} size={12}/>
        </div>
      ) : offline ? (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 2,
          width: 6, height: 6, borderRadius: 3, background: PALETTE.charcoal.warn,
        }}/>
      ) : null}
      {!offline && (
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 140, height: 140, borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}/>
      )}

      <div style={{
        position: 'relative',
        minWidth: 0,
      }}>
        <div style={{
          fontSize: 13,
          color: PALETTE.charcoal.text,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          paddingRight: d.click && !editing ? 18 : 0,
        }}>
          {locationLabel}
        </div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minHeight: 0,
        marginTop: 4,
      }}>
        <div style={{
          fontSize: 39,
          lineHeight: 0.96,
          fontWeight: 600,
          letterSpacing: 0,
          color: PALETTE.charcoal.text,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}>
          {temp}
        </div>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: accent + '14',
          border: `1px solid ${accent}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <WeatherGlyph icon={w?.icon} size={34} color={hasData ? tone : PALETTE.charcoal.dimDeep}/>
        </div>
      </div>

      <div style={{
        marginTop: 'auto',
        minWidth: 0,
      }}>
        <div style={{
          fontSize: 12,
          color: offline ? PALETTE.charcoal.warn : PALETTE.charcoal.text,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          paddingRight: d.click && !editing ? 18 : 0,
        }}>
          {condition}
        </div>
        {highLow && (
          <div style={{
            marginTop: 4,
            fontSize: 10,
            color: PALETTE.charcoal.dim,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingRight: d.click && !editing ? 18 : 0,
          }}>
            {highLow}
          </div>
        )}
      </div>

      {d.click && !editing && (
        <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
          <IconChevron size={14} color={PALETTE.charcoal.dim}/>
        </div>
      )}
      {editing && onRemove && <RemoveBadge onClick={onRemove}/>}
    </div>
  )
}

function AutomationRow({ a, accent, editing, onToggle }) {
  // 홈 화면에선 자동화 row 클릭으로 편집 진입하지 않음 — 토글만 동작.
  // 편집은 자동화 관리 페이지(/automations) 에서. 편집 모드일 땐 reorderable
  // 의 drag handle 로만 사용.
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', cursor: editing ? 'grab' : 'default',
      borderBottom: `1px solid ${PALETTE.charcoal.line}`,
      background: PALETTE.charcoal.card,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11,
        background: a.enabled ? accent + '22' : '#17130f',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {a.trigger === 'time' ? <IconClock size={18} color={a.enabled ? accent : PALETTE.charcoal.dim}/> :
         a.trigger === 'sensor' ? <IconSensor size={18} color={a.enabled ? accent : PALETTE.charcoal.dim}/> :
         <IconButton size={18} color={a.enabled ? accent : PALETTE.charcoal.dim}/>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.charcoal.text }}>{a.name}</div>
        <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {summarizeAutomation(a)}
        </div>
      </div>
      {editing ? (
        <IconGrip size={16} color={PALETTE.charcoal.dim}/>
      ) : (
        <MobileToggle on={a.enabled} accent={accent} onToggle={onToggle}/>
      )}
    </div>
  );
}
