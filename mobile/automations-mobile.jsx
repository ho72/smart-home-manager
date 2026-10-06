import { useState } from 'react'
import { PALETTE, IconBolt, IconClock, IconSensor, IconButton, IconTrash, IconPlus,
         IconHome, IconMoon, IconLeaf, IconFilm, IconSparkle, IconCloud, IconFan, IconBulb } from '../components/shared'
import { MobileHeader, MobileToggle, DeviceIcon } from './shared-mobile'
import { summarizeAutomation, SCENE_ICON_BY_KEY } from './main-mobile'

// 버튼 트리거 자동화에서 선택 가능한 아이콘 셋. 키는 main-mobile 의
// SCENE_ICON_BY_KEY 와 동일하게 유지해야 홈 화면에서 그대로 렌더된다.
const SCENE_ICON_OPTIONS = [
  { k: 'home',    Icon: IconHome },
  { k: 'moon',    Icon: IconMoon },
  { k: 'leaf',    Icon: IconLeaf },
  { k: 'film',    Icon: IconFilm },
  { k: 'sparkle', Icon: IconSparkle },
  { k: 'bolt',    Icon: IconBolt },
  { k: 'cloud',   Icon: IconCloud },
  { k: 'fan',     Icon: IconFan },
  { k: 'bulb',    Icon: IconBulb },
  { k: 'button',  Icon: IconButton },
]

export function AutomationsMobile({ route, state, setState, back, go, tweaks, onSave }) {
  const saveAutomations = (next) => {
    setState(prev => ({ ...prev, automations: next }))
    onSave && onSave(next)
  }
  const accent = tweaks.accent;
  const r = tweaks.radius;
  const parts = route.split(':'); // automations | new:<trigger> | edit:<id>
  const mode = parts[1]; // undefined = list, 'new' or 'edit'
  const param = parts[2]; // for new: trigger type; for edit: id

  if (!mode) return <AutomationsList state={state} setState={setState} back={back} go={go} accent={accent} r={r} saveAutomations={saveAutomations}/>;
  if (mode === 'new') {
    const t = param === 'button' || param === 'sensor' ? param : 'time';
    return <AutomationEditor mode="new" triggerType={t}
             state={state} setState={setState}
             back={() => go('automations')} go={go} accent={accent} r={r} onSave={onSave}/>;
  }
  return <AutomationEditor mode="edit" id={param} state={state} setState={setState}
                            back={() => go('automations')} go={go} accent={accent} r={r} onSave={onSave}/>;
}

function AutomationsList({ state, setState, back, go, accent, r, saveAutomations }) {
  const automations = state.automations || [];
  const timeOrSensor = automations.filter(a => a.trigger !== 'button');
  const buttons = automations.filter(a => a.trigger === 'button');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <MobileHeader title="자동화" onBack={back} accent={accent}
        right={
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(o => !o)} style={{
              width: 44, height: 44, borderRadius: 12,
              background: accent + '22', border: `1px solid ${accent}55`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconPlus size={18} color={accent}/>
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{
                  position: 'fixed', inset: 0, zIndex: 50,
                }}/>
                <div style={{
                  position: 'absolute', top: 50, right: 0, zIndex: 60,
                  background: PALETTE.charcoal.card, borderRadius: 12,
                  border: `1px solid ${PALETTE.charcoal.line}`,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                  minWidth: 160, overflow: 'hidden',
                }}>
                  <DropItem Icon={IconClock} label="시간 자동화"
                    onClick={() => { setMenuOpen(false); go('automations:new:time') }}/>
                  <div style={{ height: 1, background: PALETTE.charcoal.line }}/>
                  <DropItem Icon={IconSensor} label="센서 자동화"
                    onClick={() => { setMenuOpen(false); go('automations:new:sensor') }}/>
                  <div style={{ height: 1, background: PALETTE.charcoal.line }}/>
                  <DropItem Icon={IconButton} label="버튼 자동화"
                    onClick={() => { setMenuOpen(false); go('automations:new:button') }}/>
                </div>
              </>
            )}
          </div>
        }/>
      <div style={{ padding: '14px 14px 28px' }}>
        {automations.length === 0 ? (
          <EmptyState accent={accent} r={r} go={go}/>
        ) : (
          <>
            {/* 시간/센서 트리거 — 토글 row */}
            <SectionHeader>자동화</SectionHeader>
            {timeOrSensor.length === 0 ? (
              <div style={{
                padding: '20px 16px', background: PALETTE.charcoal.card,
                borderRadius: r + 2, border: `1px dashed ${PALETTE.charcoal.line}`,
                color: PALETTE.charcoal.dim, fontSize: 12, textAlign: 'center',
                marginBottom: 18,
              }}>
                아직 시간 자동화가 없어요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {timeOrSensor.map(a => (
                  <button key={a.id} onClick={() => go('automations:edit:' + a.id)} style={{
                    background: PALETTE.charcoal.card, borderRadius: r + 2,
                    padding: '16px 18px', border: `1px solid ${a.enabled ? accent + '55' : PALETTE.charcoal.line}`,
                    display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                    textAlign: 'left', color: PALETTE.charcoal.text, minHeight: 78,
                    fontFamily: 'inherit',
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 13,
                      background: a.enabled ? accent + '22' : '#17130f',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {a.trigger === 'sensor'
                        ? <IconSensor size={20} color={a.enabled ? accent : PALETTE.charcoal.dim}/>
                        : <IconClock  size={20} color={a.enabled ? accent : PALETTE.charcoal.dim}/>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{a.name}</span>
                        {a.oneShot && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                            padding: '2px 6px', borderRadius: 6,
                            background: accent + '22', color: accent,
                          }}>1회</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 3,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {summarizeAutomation(a)}
                      </div>
                    </div>
                    <MobileToggle on={a.enabled} accent={accent}
                      onToggle={(e) => { e.stopPropagation();
                        const next = automations.map(x => x.id === a.id ? { ...x, enabled: !x.enabled } : x);
                        saveAutomations(next);
                      }}/>
                  </button>
                ))}
              </div>
            )}

            {/* 구분선 */}
            <div style={{ height: 1, background: PALETTE.charcoal.line, margin: '6px 0 18px' }}/>

            {/* 버튼 단축키 — 4-per-row grid, 토글 없음, 탭=편집 */}
            <SectionHeader>버튼 단축키</SectionHeader>
            {buttons.length === 0 ? (
              <div style={{
                padding: '20px 16px', background: PALETTE.charcoal.card,
                borderRadius: r + 2, border: `1px dashed ${PALETTE.charcoal.line}`,
                color: PALETTE.charcoal.dim, fontSize: 12, textAlign: 'center',
              }}>
                아직 버튼 자동화가 없어요.
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
              }}>
                {buttons.map(a => {
                  const Icon = SCENE_ICON_BY_KEY[a.iconKey] || IconSparkle
                  const hasActions = (a.actions || []).length > 0
                  return (
                    <button key={a.id} onClick={() => go('automations:edit:' + a.id)} style={{
                      background: PALETTE.charcoal.card, borderRadius: r,
                      border: `1px solid ${PALETTE.charcoal.line}`,
                      padding: '14px 6px', minHeight: 84,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 6, cursor: 'pointer', fontFamily: 'inherit',
                      color: PALETTE.charcoal.text,
                      opacity: hasActions ? 1 : 0.7,
                    }}>
                      <Icon size={20} color={hasActions ? accent : PALETTE.charcoal.dim}/>
                      <div style={{
                        fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                        maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{a.name}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function EmptyState({ accent, r, go }) {
  return (
    <div style={{
      padding: '56px 24px', background: PALETTE.charcoal.card,
      borderRadius: r + 2, border: `1px solid ${PALETTE.charcoal.line}`,
      textAlign: 'center',
    }}>
      <div style={{
        width: 62, height: 62, borderRadius: 18, margin: '0 auto 14px',
        background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconBolt size={28} color={accent}/>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>아직 자동화가 없어요</div>
      <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginBottom: 20, lineHeight: 1.5 }}>
        시간 자동화 또는 한 번의 탭으로 실행되는 버튼 단축키를 만들어 보세요.
      </div>
      <button onClick={() => go('automations:new:time')} style={{
        padding: '12px 22px', minHeight: 48, borderRadius: 14,
        background: accent, color: '#14100d', border: 'none',
        fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}>첫 자동화 만들기</button>
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim,
      textTransform: 'uppercase', fontWeight: 500, padding: '4px 4px 10px',
    }}>{children}</div>
  )
}

function DropItem({ Icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      width: '100%', padding: '12px 14px', minHeight: 44,
      background: 'transparent', border: 'none', cursor: 'pointer',
      color: PALETTE.charcoal.text, fontSize: 13, fontWeight: 600,
      fontFamily: 'inherit', textAlign: 'left',
    }}>
      <Icon size={16} color={PALETTE.charcoal.text}/>
      {label}
    </button>
  )
}

function AutomationEditor({ mode, id, triggerType, state, setState, back, go, accent, r, onSave }) {
  const saveAutomations = (next) => {
    setState(prev => ({ ...prev, automations: next }))
    onSave && onSave(next)
  }
  const existing = mode === 'edit' ? (state.automations || []).find(a => a.id === id) : null;
  // 센서 자동화는 첫 화면에서 첫 번째 sensor-capable device 가 자동 선택돼야
  // 사용자가 빈 select 보고 당황 안 함.
  const sensorDevices = (state.devices || []).filter(d =>
    d.type === 'airpurifier' || d.iconKey === 'wind'
  );
  const [draft, setDraft] = useState(existing || {
    id: 'a_' + Date.now().toString(36),
    name: triggerType === 'button' ? '새 버튼'
        : triggerType === 'sensor' ? '새 센서 자동화'
        : '새 자동화',
    enabled: true,
    trigger: triggerType || 'time',
    triggerTime: '07:00',
    triggerSensor: triggerType === 'sensor' ? {
      deviceId: sensorDevices[0]?.id || '',
      field: 'aqi',
      op: '>',
      value: 75,
    } : undefined,
    oneShot: false,
    iconKey: triggerType === 'button' ? 'sparkle' : undefined,
    actions: [], // [{deviceId, deviceLabel, action: 'on'|'off', label}]
  });
  const isButton = draft.trigger === 'button';
  const isSensor = draft.trigger === 'sensor';

  // 위젯(weather/clock/energy) 은 제어 대상이 아니므로 자동화 액션 목록에서 제외
  const devices = (state.devices || []).filter(d => d.provider !== 'widgets');
  const patch = (p) => setDraft({ ...draft, ...p });
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const editingDevice = devices.find(d => d.id === editingDeviceId);

  const save = () => {
    const list = state.automations || [];
    const next = existing
      ? list.map(a => a.id === draft.id ? draft : a)
      : [...list, draft];
    saveAutomations(next);
    go('automations');
  };

  const del = () => {
    const next = (state.automations || []).filter(a => a.id !== draft.id);
    saveAutomations(next);
    go('automations');
  };

  // 디바이스 1개에 해당하는 모든 액션을 한 번에 교체 (편집 시트에서 done 시 호출)
  const replaceDeviceActions = (deviceId, newActionsForDevice) => {
    const others = draft.actions.filter(a => a.deviceId !== deviceId);
    patch({ actions: [...others, ...newActionsForDevice] });
  };

  return (
    <>
      <MobileHeader title={mode === 'edit' ? '자동화 편집' : '새 자동화'} onBack={back} accent={accent}/>
      <div style={{ padding: '14px 14px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Name */}
        <SectionCard label="이름" r={r}>
          <input value={draft.name} onChange={(e) => patch({ name: e.target.value })}
                 maxLength={28} style={inputStyle()}/>
        </SectionCard>

        {/* Trigger — type 은 + 메뉴에서 결정되어 SegControl 없음. 시간은 oneShot 옵션,
            버튼은 아이콘 픽커가 그 자리에, 센서는 디바이스/필드/연산자/임계값. */}
        {!isButton && !isSensor && (
          <SectionCard label="시간 트리거" r={r}>
            <Lbl>실행 시간</Lbl>
            <input type="time" value={draft.triggerTime} onChange={(e) => patch({ triggerTime: e.target.value })}
                   style={{
                     ...inputStyle(),
                     fontSize: 22, fontVariantNumeric: 'tabular-nums',
                     // iOS Safari 의 input[type=time] 은 ::-webkit-date-and-time-value
                     // 가 fontSize 에 따른 intrinsic min-width 를 강제해서 width:100%
                     // 보다 부풀고 부모 밖으로 튀어나감. appearance:none 으로 native
                     // chrome 을 벗기면 일반 input 처럼 width 가 정상 작동 (탭 시
                     // native time picker 는 그대로 뜸).
                     WebkitAppearance: 'none', appearance: 'none',
                     textAlign: 'center', maxWidth: '100%',
                   }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '10px 0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>일회성</div>
                <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 3, lineHeight: 1.5 }}>
                  한 번 실행되면 자동으로 삭제됩니다.
                </div>
              </div>
              <MobileToggle on={!!draft.oneShot} accent={accent}
                onToggle={() => patch({ oneShot: !draft.oneShot })}/>
            </div>
          </SectionCard>
        )}
        {isSensor && (
          <SectionCard label="센서 트리거" r={r}>
            {sensorDevices.length === 0 ? (
              <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, padding: '6px 0', lineHeight: 1.5 }}>
                센서를 가진 기기가 없어요. 공기청정기를 먼저 연결에서 추가하세요.
              </div>
            ) : (
              <>
                <Lbl>대상 기기</Lbl>
                <select value={draft.triggerSensor?.deviceId || ''}
                        onChange={(e) => patch({ triggerSensor: { ...draft.triggerSensor, deviceId: e.target.value }})}
                        style={{ ...selectStyle(accent), width: '100%', marginBottom: 14 }}>
                  {sensorDevices.map(d => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
                <Lbl>측정값</Lbl>
                <div style={{ marginBottom: 14 }}>
                  <ChipRow value={draft.triggerSensor?.field || 'aqi'}
                           onChange={(v) => patch({ triggerSensor: { ...draft.triggerSensor, field: v }})}
                           accent={accent}
                           options={[
                             { v: 'aqi',         label: 'AQI' },
                             { v: 'temperature', label: '온도' },
                             { v: 'humidity',    label: '습도' },
                           ]}/>
                </div>
                <Lbl>조건</Lbl>
                <div style={{ marginBottom: 14 }}>
                  <ChipRow value={draft.triggerSensor?.op || '>'}
                           onChange={(v) => patch({ triggerSensor: { ...draft.triggerSensor, op: v }})}
                           accent={accent}
                           options={[
                             { v: '>',  label: '초과(>)' },
                             { v: '<',  label: '미만(<)' },
                             { v: '>=', label: '이상(≥)' },
                             { v: '<=', label: '이하(≤)' },
                           ]}/>
                </div>
                <Lbl>임계값</Lbl>
                <input type="number" inputMode="decimal" step="0.1"
                       value={draft.triggerSensor?.value ?? 0}
                       onChange={(e) => patch({ triggerSensor: { ...draft.triggerSensor, value: e.target.value === '' ? '' : Number(e.target.value) }})}
                       style={inputStyle()}/>
                <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 8, lineHeight: 1.5 }}>
                  값이 임계를 <b style={{ color: PALETTE.charcoal.text }}>처음 통과하는 순간</b> 1회 실행됩니다 (1분 폴링 기준).
                </div>
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '10px 0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>일회성</div>
                <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 3, lineHeight: 1.5 }}>
                  한 번 실행되면 자동으로 삭제됩니다.
                </div>
              </div>
              <MobileToggle on={!!draft.oneShot} accent={accent}
                onToggle={() => patch({ oneShot: !draft.oneShot })}/>
            </div>
          </SectionCard>
        )}
        {isButton && (
          <SectionCard label="버튼 트리거" r={r}>
            <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, lineHeight: 1.6, marginBottom: 14 }}>
              홈 화면 상단에 버튼으로 노출됩니다. 눌러 이 자동화를 실행하세요.
            </div>
            <Lbl>아이콘</Lbl>
            <IconPicker value={draft.iconKey || 'sparkle'} onChange={(k) => patch({ iconKey: k })} accent={accent}/>
          </SectionCard>
        )}

        {/* Actions */}
        <SectionCard label={`실행 · ${draft.actions.length}개 동작`} r={r}>
          {devices.length === 0 ? (
            <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, padding: '6px 0' }}>
              먼저 연결에서 기기를 추가하세요.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {devices.map((d, i) => {
                const myActions = draft.actions.filter(a => a.deviceId === d.id);
                const summary = myActions.length === 0
                  ? '설정 안 됨'
                  : myActions.map(summaryOfAction).join(' · ');
                return (
                  <button key={d.id} onClick={() => setEditingDeviceId(d.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 0', cursor: 'pointer',
                    background: 'transparent', border: 'none',
                    borderTop: i === 0 ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                    color: PALETTE.charcoal.text, textAlign: 'left',
                    fontFamily: 'inherit', width: '100%',
                  }}>
                    <DeviceIcon iconKey={d.iconKey} size={20} color={PALETTE.charcoal.text}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{d.label}</div>
                      <div style={{
                        fontSize: 11, color: myActions.length ? accent : PALETTE.charcoal.dim,
                        marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{summary}</div>
                    </div>
                    <div style={{
                      width: 30, height: 30, borderRadius: 9,
                      background: myActions.length ? accent + '22' : '#1a1612',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {myActions.length
                        ? <span style={{ color: accent, fontSize: 13, fontWeight: 700 }}>{myActions.length}</span>
                        : <IconPlus size={14} color={PALETTE.charcoal.dim}/>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <button onClick={save} style={{
          width: '100%', minHeight: 56, borderRadius: 16,
          background: accent, color: '#14100d', border: 'none',
          fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          letterSpacing: 0.3,
        }}>{mode === 'edit' ? '변경사항 저장' : '자동화 만들기'}</button>

        {mode === 'edit' && (
          <button onClick={del} style={{
            width: '100%', minHeight: 48, borderRadius: 14,
            background: 'transparent', color: '#d67a5a',
            border: `1px solid #d67a5a55`,
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <IconTrash size={16} color="#d67a5a"/>
            자동화 삭제
          </button>
        )}
      </div>

      {editingDevice && (
        <DeviceActionSheet
          device={editingDevice}
          currentActions={draft.actions.filter(a => a.deviceId === editingDevice.id)}
          accent={accent}
          r={r}
          onClose={() => setEditingDeviceId(null)}
          onSave={(newActions) => {
            replaceDeviceActions(editingDevice.id, newActions);
            setEditingDeviceId(null);
          }}/>
      )}
    </>
  );
}

// ── Per-device action 설정 시트 ───────────────────────────────────

const AIRP_MODE_LABELS = { 0: '자동', 1: '취침', 2: '즐겨찾기', 3: '수동' }

function summaryOfAction(a) {
  switch (a.action) {
    case 'on':  return '켜기'
    case 'off': return '끄기'
    case 'open':  return '열기'
    case 'close': return '닫기'
    case 'pause': return '정지'
    case 'speed':          return `속도 ${a.percent}%`
    case 'level':          return `레벨 ${a.level}%`
    case 'angle':          return `회전 ${a.angle}°`
    case 'oscillation':    return a.enabled ? '회전 ON' : '회전 OFF'
    case 'mode':           return `모드 ${AIRP_MODE_LABELS[a.mode] ?? a.mode}`
    case 'fan_level':      return `풍량 ${a.level}`
    case 'favorite_level': return `즐겨찾기 ${a.level}`
    default: return a.action
  }
}

function deviceKind(d) {
  // 디바이스 종류 판별 — 어떤 옵션을 보여줄지 결정
  if (d.type === 'airpurifier' || d.iconKey === 'wind')  return 'airpurifier'
  if (d.provider === 'builtin' && d.type === 'fan') return 'fan'
  if (d.iconKey === 'blind' || d.type === 'blind')  return 'blind'
  if (d.iconKey === 'bulb')                          return 'dimmer'   // SwitchLevel 가능
  return 'switch'  // 단순 on/off
}

function DeviceActionSheet({ device, currentActions, accent, r, onClose, onSave }) {
  const kind = deviceKind(device)
  const findAct = (act) => currentActions.find(a => a.action === act)

  // 각 옵션의 enabled 상태 + 값
  const [power, setPower] = useState(() => {
    if (findAct('on'))  return 'on'
    if (findAct('off')) return 'off'
    if (findAct('open'))  return 'open'
    if (findAct('close')) return 'close'
    if (findAct('pause')) return 'pause'
    return ''
  })
  const [speedOn, setSpeedOn]     = useState(!!findAct('speed'))
  const [speed, setSpeed]         = useState(findAct('speed')?.percent ?? 50)
  const [oscOn, setOscOn]         = useState(!!findAct('oscillation'))
  const [osc, setOsc]             = useState(findAct('oscillation')?.enabled ?? true)
  const [angleOn, setAngleOn]     = useState(!!findAct('angle'))
  const [angle, setAngle]         = useState(findAct('angle')?.angle ?? 90)
  const [levelOn, setLevelOn]     = useState(!!findAct('level'))
  const [level, setLevel]         = useState(findAct('level')?.level ?? 50)
  // airpurifier
  const [airModeOn, setAirModeOn]         = useState(!!findAct('mode'))
  const [airMode, setAirMode]             = useState(findAct('mode')?.mode ?? 0)
  const [airFanLvlOn, setAirFanLvlOn]     = useState(!!findAct('fan_level'))
  const [airFanLvl, setAirFanLvl]         = useState(findAct('fan_level')?.level ?? 1)
  const [airFavLvlOn, setAirFavLvlOn]     = useState(!!findAct('favorite_level'))
  const [airFavLvl, setAirFavLvl]         = useState(findAct('favorite_level')?.level ?? 0)

  const buildActions = () => {
    const base = { deviceId: device.id, deviceLabel: device.label }
    const out = []
    if (kind === 'blind') {
      // 블라인드는 레벨만 (0=닫힘, 100=열림). open/close 별도 옵션 없음.
      out.push({ ...base, action: 'level', level: Number(level) })
    } else {
      if (power === 'on' || power === 'off') out.push({ ...base, action: power })
      if (kind === 'fan') {
        if (speedOn) out.push({ ...base, action: 'speed', percent: Number(speed) })
        if (oscOn)   out.push({ ...base, action: 'oscillation', enabled: !!osc })
        if (angleOn) out.push({ ...base, action: 'angle', angle: Number(angle) })
      }
      if (kind === 'airpurifier') {
        if (airModeOn)   out.push({ ...base, action: 'mode',           mode:  Number(airMode) })
        if (airFanLvlOn) out.push({ ...base, action: 'fan_level',      level: Number(airFanLvl) })
        if (airFavLvlOn) out.push({ ...base, action: 'favorite_level', level: Number(airFavLvl) })
      }
      if (kind === 'dimmer' && levelOn) {
        out.push({ ...base, action: 'level', level: Number(level) })
      }
    }
    return out
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520,
        background: PALETTE.charcoal.bg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '18px 18px 28px',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        maxHeight: '82vh', overflowY: 'auto',
        border: `1px solid ${PALETTE.charcoal.line}`,
      }}>
        <div style={{
          width: 40, height: 4, background: PALETTE.charcoal.line, borderRadius: 2,
          margin: '0 auto 14px',
        }}/>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{device.label}</div>
        <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginBottom: 16, letterSpacing: 0.5 }}>
          체크된 항목들이 자동화 실행 시 적용됩니다
        </div>

        {/* 블라인드: 레벨 슬라이더만 (항상 적용) */}
        {kind === 'blind' && (
          <Row label="열림 정도">
            <SliderInput value={level} onChange={setLevel} accent={accent}/>
            <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginTop: 8, lineHeight: 1.5 }}>
              0% = 완전히 닫힘 · 100% = 완전히 열림
            </div>
          </Row>
        )}

        {/* 스위치 / Bulb / Fan 의 전원 */}
        {kind !== 'blind' && (
          <Row label="전원">
            <ChipRow value={power} onChange={setPower} accent={accent}
              options={[
                { v: 'on', label: 'ON' },
                { v: 'off', label: 'OFF' },
              ]}/>
          </Row>
        )}

        {kind === 'fan' && (
          <>
            <div style={{
              fontSize: 11, color: PALETTE.charcoal.dim,
              padding: '8px 10px', marginBottom: 12, lineHeight: 1.5,
              background: '#1a1612', borderRadius: 8, border: `1px solid ${PALETTE.charcoal.line}`,
            }}>
              ✓ 체크된 항목만 자동화 시 적용됩니다.<br/>
              체크 해제된 항목은 <b style={{ color: PALETTE.charcoal.text }}>현재 선풍기 상태 그대로 유지</b>됩니다.
            </div>
            <CheckRow label="속도" checked={speedOn} onCheck={setSpeedOn} accent={accent}>
              <SliderInput value={speed} onChange={setSpeed} accent={accent}/>
            </CheckRow>
            <CheckRow label="회전" checked={oscOn} onCheck={setOscOn} accent={accent}>
              <ChipRow value={osc ? 'on' : 'off'} onChange={(v) => setOsc(v === 'on')} accent={accent}
                options={[{ v: 'on', label: 'ON' }, { v: 'off', label: 'OFF' }]}/>
            </CheckRow>
            <CheckRow label="각도" checked={angleOn} onCheck={setAngleOn} accent={accent}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[30, 60, 90, 120, 140].map(a => (
                  <button key={a} onClick={() => setAngle(a)} style={{
                    flex: '1 0 auto', minWidth: 52, minHeight: 40, padding: '0 12px',
                    borderRadius: 9,
                    background: angle === a ? accent : '#17130f',
                    color: angle === a ? '#14100d' : PALETTE.charcoal.text,
                    border: angle === a ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{a}°</button>
                ))}
              </div>
            </CheckRow>
          </>
        )}

        {kind === 'airpurifier' && (
          <>
            <div style={{
              fontSize: 11, color: PALETTE.charcoal.dim,
              padding: '8px 10px', marginBottom: 12, lineHeight: 1.5,
              background: '#1a1612', borderRadius: 8, border: `1px solid ${PALETTE.charcoal.line}`,
            }}>
              ✓ 체크된 항목만 자동화 시 적용됩니다.<br/>
              체크 해제된 항목은 <b style={{ color: PALETTE.charcoal.text }}>현재 상태 그대로 유지</b>됩니다.
            </div>
            <CheckRow label="모드" checked={airModeOn} onCheck={setAirModeOn} accent={accent}>
              <ChipRow value={String(airMode)} onChange={(v) => setAirMode(Number(v))} accent={accent}
                options={[
                  { v: '0', label: '자동' }, { v: '1', label: '취침' },
                  { v: '2', label: '즐겨찾기' }, { v: '3', label: '수동' },
                ]}/>
            </CheckRow>
            <CheckRow label="풍량 (수동 모드)" checked={airFanLvlOn} onCheck={setAirFanLvlOn} accent={accent}>
              <ChipRow value={String(airFanLvl)} onChange={(v) => setAirFanLvl(Number(v))} accent={accent}
                options={[{ v: '1', label: '1' }, { v: '2', label: '2' }, { v: '3', label: '3' }]}/>
            </CheckRow>
            <CheckRow label="즐겨찾기 단수 (즐겨찾기 모드)" checked={airFavLvlOn} onCheck={setAirFavLvlOn} accent={accent}>
              <SliderInput value={airFavLvl} onChange={setAirFavLvl} accent={accent}
                           max={14} step={1} unit=""/>
            </CheckRow>
          </>
        )}

        {kind === 'dimmer' && (
          <CheckRow label="밝기" checked={levelOn} onCheck={setLevelOn} accent={accent}>
            <SliderInput value={level} onChange={setLevel} accent={accent}/>
          </CheckRow>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{
            flex: 1, minHeight: 50, borderRadius: 12,
            background: 'transparent', border: `1px solid ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.text, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>취소</button>
          <button onClick={() => onSave(buildActions())} style={{
            flex: 1, minHeight: 50, borderRadius: 12,
            background: accent, border: 'none', color: '#14100d',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>완료</button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  )
}

function CheckRow({ label, checked, onCheck, accent, children }) {
  return (
    <div style={{ marginBottom: 14, opacity: checked ? 1 : 0.55 }}>
      <button onClick={() => onCheck(!checked)} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: 0,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: PALETTE.charcoal.text, marginBottom: 8, fontFamily: 'inherit',
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 6,
          background: checked ? accent : 'transparent',
          border: `1.5px solid ${checked ? accent : PALETTE.charcoal.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {checked && <span style={{ color: '#14100d', fontSize: 13, fontWeight: 700 }}>✓</span>}
        </div>
        <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      </button>
      <div style={{ pointerEvents: checked ? 'auto' : 'none' }}>{children}</div>
    </div>
  )
}

function ChipRow({ value, onChange, options, accent }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const sel = value === o.v
        return (
          <button key={o.v || 'none'} onClick={() => onChange(o.v)} style={{
            flex: 1, minWidth: 56, minHeight: 40, padding: '0 14px', borderRadius: 9,
            background: sel ? accent : '#17130f',
            color: sel ? '#14100d' : PALETTE.charcoal.text,
            border: sel ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}

function SliderInput({ value, onChange, accent, max = 100, step = 5, unit = '%' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <input type="range" min={0} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             style={{ flex: 1, accentColor: accent, height: 28 }}/>
      <div style={{
        minWidth: 56, textAlign: 'right',
        fontSize: 16, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums',
      }}>{value}{unit}</div>
    </div>
  )
}

function SectionCard({ label, children, r }) {
  return (
    <div style={{
      background: PALETTE.charcoal.card, borderRadius: r + 2,
      padding: '16px 18px', border: `1px solid ${PALETTE.charcoal.line}`,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 1.4, color: PALETTE.charcoal.dim, textTransform: 'uppercase', fontWeight: 500, marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Lbl({ children }) {
  return <div style={{ fontSize: 11, color: PALETTE.charcoal.dim, marginBottom: 8 }}>{children}</div>;
}

function inputStyle() {
  return {
    width: '100%', background: 'transparent', border: `1px solid ${PALETTE.charcoal.line}`,
    borderRadius: 10, padding: '12px 14px',
    color: PALETTE.charcoal.text, fontSize: 15, fontWeight: 500,
    outline: 'none', fontFamily: 'inherit',
    colorScheme: 'dark',
  };
}
function selectStyle(accent) {
  return {
    flex: 1, background: '#17130f', border: `1px solid ${PALETTE.charcoal.line}`,
    borderRadius: 10, padding: '12px 14px', minHeight: 48,
    color: PALETTE.charcoal.text, fontSize: 14, fontWeight: 500,
    outline: 'none', fontFamily: 'inherit',
    appearance: 'none', cursor: 'pointer',
  };
}

function SegControl({ value, options, onChange, accent }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 6,
      background: '#17130f', borderRadius: 12, padding: 4,
      border: `1px solid ${PALETTE.charcoal.line}`,
    }}>
      {options.map(o => {
        const sel = value === o.k;
        return (
          <button key={o.k} onClick={() => onChange(o.k)} style={{
            background: sel ? accent : 'transparent',
            color: sel ? '#14100d' : PALETTE.charcoal.text,
            border: 'none', borderRadius: 8,
            padding: '10px 6px', minHeight: 44,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <o.Icon size={15} color={sel ? '#14100d' : PALETTE.charcoal.text}/>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ActionChip({ label, active, onClick, accent }) {
  return (
    <button onClick={onClick} style={{
      minWidth: 54, minHeight: 36, padding: '0 12px', borderRadius: 10,
      background: active ? accent : '#17130f',
      color: active ? '#14100d' : PALETTE.charcoal.text,
      border: active ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  );
}

function IconPicker({ value, onChange, accent }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
    }}>
      {SCENE_ICON_OPTIONS.map(({ k, Icon }) => {
        const sel = value === k
        return (
          <button key={k} onClick={() => onChange(k)} style={{
            aspectRatio: '1 / 1', borderRadius: 10,
            background: sel ? accent + '22' : '#17130f',
            border: `1px solid ${sel ? accent : PALETTE.charcoal.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 0,
          }}>
            <Icon size={20} color={sel ? accent : PALETTE.charcoal.text}/>
          </button>
        )
      })}
    </div>
  )
}

