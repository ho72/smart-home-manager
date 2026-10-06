import { useState, useEffect, useRef } from 'react'
import { PALETTE, IconHome, IconChevron } from '../components/shared'
import { MobileHeader } from './shared-mobile'
import { api } from '../src/api.js'

function IconUser({ size = 18, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 21v-1a8 8 0 0 1 16 0v1"/>
    </svg>
  )
}

function IconPlus({ size = 16, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function SectionLabel({ text, onAdd, accent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 8, marginTop: 20,
    }}>
      <div style={{
        flex: 1, fontSize: 11, fontWeight: 700, color: PALETTE.charcoal.dim,
        letterSpacing: 0.8, textTransform: 'uppercase',
      }}>{text}</div>
      {onAdd && (
        <button onClick={onAdd} style={{
          width: 22, height: 22, borderRadius: 6, border: 'none',
          background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}>
          <IconPlus size={12} color={accent}/>
        </button>
      )}
    </div>
  )
}

function STConnectionRow({ homeId, accent, r }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    if (!homeId) return
    try { setStatus(await api.smartthingsOAuthStatus({ homeId })) }
    catch { setStatus({ connected: false }) }
  }
  useEffect(() => { refresh() }, [homeId])

  const onConnect = async () => {
    setBusy(true)
    try {
      const { authorize_url } = await api.smartthingsOAuthStart({ homeId })
      window.location.href = authorize_url
    } catch (e) {
      setBusy(false)
      alert('연결 시작 실패: ' + (e?.message || e))
    }
  }

  const onDisconnect = async () => {
    if (!confirm('SmartThings 연결을 해제할까요?')) return
    setBusy(true)
    try { await api.smartthingsOAuthDisconnect({ homeId }) } catch {}
    await refresh()
    setBusy(false)
  }

  if (status === null) return null
  const connected = status.connected
  const canManage = status.canManage !== false

  return (
    <div style={{
      background: '#17130f', borderRadius: r, border: `1px solid ${PALETTE.charcoal.line}`,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0,
        background: connected ? '#16a34a' : PALETTE.charcoal.dim }}/>
      <div style={{ flex: 1, fontSize: 13, color: connected ? PALETTE.charcoal.text : PALETTE.charcoal.dim }}>
        {connected ? 'SmartThings 연결됨' : 'SmartThings 미연결'}
      </div>
      {canManage && (
        <button onClick={connected ? onDisconnect : onConnect} disabled={busy} style={{
          height: 28, padding: '0 10px', borderRadius: 7,
          background: connected ? '#2a1a1a' : accent,
          color: connected ? PALETTE.charcoal.warn : '#1a1a1a',
          border: connected ? `1px solid ${PALETTE.charcoal.warn}44` : 'none',
          fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer',
        }}>
          {busy ? '…' : connected ? '해제' : '연결'}
        </button>
      )}
    </div>
  )
}

function XiaomiStatusRow({ homeId, r, accent, canManage, go, source }) {
  const [connected, setConnected] = useState(null)
  useEffect(() => {
    if (!homeId) return
    api.xiaomiCloudCatalog({ homeId })
      .then(({ fetchedAt }) => setConnected(Boolean(fetchedAt)))
      .catch(() => setConnected(false))
  }, [homeId])
  if (connected === null) return null
  const openXiaomi = () => {
    if (!homeId) return
    const sourceSuffix = source ? `:${source}` : ''
    go(`widgets:xiaomi:home:${homeId}${sourceSuffix}`)
  }
  return (
    <div style={{
      background: '#17130f', borderRadius: r, border: `1px solid ${PALETTE.charcoal.line}`,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0,
        background: connected ? '#16a34a' : PALETTE.charcoal.dim }}/>
      <div style={{ flex: 1, fontSize: 13, color: connected ? PALETTE.charcoal.text : PALETTE.charcoal.dim }}>
        {connected ? 'Xiaomi 동기화됨' : 'Xiaomi 미연동'}
      </div>
      {canManage && (
        <button onClick={openXiaomi} style={{
          height: 28, padding: '0 10px', borderRadius: 7,
          background: accent, color: '#1a1a1a', border: 'none',
          fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        }}>
          {connected ? '동기화' : '연결'}
        </button>
      )}
    </div>
  )
}

function HomeDetailScreen({ homeId, back, go, accent, r, source }) {
  const [summary, setSummary] = useState(null)
  const [members, setMembers] = useState([])
  const [addingMember, setAddingMember] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const memberInputRef = useRef(null)

  const refresh = async () => {
    try {
      const data = await api.homes()
      const target = data.homes.find(h => h.id === homeId) || (homeId ? null : data.homes[0])
      const mems = target ? await api.homeMembers({ homeId: target.id }) : []
      setSummary(data)
      setMembers(mems)
    } catch (e) {
      setError(e?.message || '불러오기 실패')
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (addingMember) memberInputRef.current?.focus()
  }, [addingMember])

  const homes = summary?.homes || []
  const thisHome = homes.find(h => h.id === homeId) || (homeId ? null : homes[0])
  const canManage = thisHome?.role === 'owner'

  const addMember = async () => {
    if (!memberId.trim()) return
    setBusy(true); setError(null)
    try {
      await api.homeAddMember({ userId: memberId.trim(), role: 'member' }, { homeId: thisHome.id })
      setMemberId('')
      setAddingMember(false)
      setMembers(await api.homeMembers({ homeId: thisHome.id }))
    } catch (e) {
      setError(e?.message || '멤버 추가 실패')
    } finally { setBusy(false) }
  }

  const title = thisHome?.name || '홈'

  return (
    <>
      <MobileHeader title={title} onBack={back} accent={accent}/>
      <div style={{ padding: '14px 14px 40px' }}>
        <SectionLabel
          text="멤버"
          onAdd={canManage ? () => setAddingMember(v => !v) : null}
          accent={accent}
        />
        <div style={{
          background: PALETTE.charcoal.card, borderRadius: r + 2,
          border: `1px solid ${PALETTE.charcoal.line}`, overflow: 'hidden',
        }}>
          {members.map((m, i) => (
            <div key={m.user_id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i < members.length - 1 || addingMember
                ? `1px solid ${PALETTE.charcoal.line}` : 'none',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 999, flexShrink: 0,
                background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconUser size={14} color={accent}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.user_id}</div>
                <div style={{ fontSize: 11, color: PALETTE.charcoal.dim }}>{m.role}</div>
              </div>
            </div>
          ))}

          {addingMember && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px' }}>
              <input
                ref={memberInputRef}
                value={memberId}
                onChange={e => setMemberId(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addMember()
                  if (e.key === 'Escape') { setAddingMember(false); setMemberId('') }
                }}
                placeholder="사용자 ID"
                maxLength={40}
                style={{
                  flex: 1, background: '#17130f', border: `1px solid ${PALETTE.charcoal.line}`,
                  borderRadius: 8, padding: '9px 12px', color: PALETTE.charcoal.text,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button onClick={addMember} disabled={busy || !memberId.trim()} style={{
                height: 38, padding: '0 14px', borderRadius: 8,
                background: busy || !memberId.trim() ? '#17130f' : accent,
                color: busy || !memberId.trim() ? PALETTE.charcoal.dim : '#14100d',
                border: busy || !memberId.trim() ? `1px solid ${PALETTE.charcoal.line}` : 'none',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>
                추가
              </button>
            </div>
          )}
        </div>

        <SectionLabel text="연결" accent={accent}/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <STConnectionRow homeId={thisHome?.id} accent={accent} r={r}/>
          <XiaomiStatusRow homeId={thisHome?.id} r={r} accent={accent} canManage={canManage} go={go} source={source}/>
        </div>

        {error && (
          <div style={{ color: PALETTE.charcoal.warn, fontSize: 12, marginTop: 14 }}>{error}</div>
        )}
      </div>
    </>
  )
}

function CreateHomeSheet({ accent, r, onDone, onCancel }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const create = async () => {
    if (!name.trim()) return
    setBusy(true); setError(null)
    try {
      const created = await api.homeCreate({ name: name.trim() })
      onDone(created.id)
    } catch (e) {
      setError(e?.message || '생성 실패')
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
    }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{
        width: '100%', background: '#1a1511', borderRadius: '18px 18px 0 0',
        padding: '20px 18px 36px', boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>새 홈 만들기</div>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') create()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="홈 이름"
          maxLength={24}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#17130f', border: `1px solid ${PALETTE.charcoal.line}`,
            borderRadius: 10, padding: '12px 14px', color: PALETTE.charcoal.text,
            fontSize: 15, fontFamily: 'inherit', outline: 'none', marginBottom: 12,
          }}
        />
        {error && <div style={{ color: PALETTE.charcoal.warn, fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, height: 46, borderRadius: 10,
            background: '#2a221b', color: PALETTE.charcoal.text,
            border: `1px solid ${PALETTE.charcoal.line}`,
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}>취소</button>
          <button onClick={create} disabled={busy || !name.trim()} style={{
            flex: 2, height: 46, borderRadius: 10,
            background: busy || !name.trim() ? '#2a221b' : accent,
            color: busy || !name.trim() ? PALETTE.charcoal.dim : '#14100d',
            border: 'none',
            fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {busy ? '…' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HomesScreen({ back, go, accent, r, source }) {
  const [summary, setSummary] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const refresh = async () => {
    try { setSummary(await api.homes()) }
    catch (e) { setError(e?.message || '불러오기 실패') }
  }

  useEffect(() => { refresh() }, [])

  const homes = summary?.homes || []
  const sourceSuffix = source ? `:${source}` : ''

  const headerRight = (
    <button onClick={() => setCreating(true)} style={{
      width: 32, height: 32, borderRadius: 10, border: 'none',
      background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', padding: 0, marginRight: 4,
    }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={accent}
           strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  )

  return (
    <>
      <MobileHeader title="홈 관리" onBack={back} accent={accent} right={headerRight}/>
      <div style={{ padding: '14px 14px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {homes.map(h => (
          <button key={h.id} onClick={() => go('homes:detail:' + h.id + sourceSuffix)}
            style={{
              background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
              border: `1px solid ${PALETTE.charcoal.line}`,
              display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer', textAlign: 'left', color: PALETTE.charcoal.text, minHeight: 72,
            }}>
            <div style={{
              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
              background: accent + '16',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconHome size={18} color={accent}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.name}
              </div>
              <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 3 }}>
                {h.role === 'owner' ? '소유자' : '멤버'}
              </div>
            </div>
            <IconChevron size={16} color={PALETTE.charcoal.dim}/>
          </button>
        ))}

        {error && <div style={{ color: PALETTE.charcoal.warn, fontSize: 12 }}>{error}</div>}
      </div>

      {creating && (
        <CreateHomeSheet
          accent={accent} r={r}
          onDone={(id) => { setCreating(false); refresh(); go('homes:detail:' + id + sourceSuffix) }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  )
}

export function HomesMobile({ route, back, go, accent, r }) {
  const parts = route.split(':')
  if (parts[1] === 'detail') {
    const homeId = parts[2] || null
    const source = parts[3] || null
    const returnId = parts[4] || null
    const detailBack = source === 'widgets'
      ? () => go('widgets')
      : source === 'settings'
        ? () => go('homes:settings')
        : source === 'scale'
          ? () => go(returnId ? `scale:${returnId}` : 'scale')
        : () => go('homes')
    return <HomeDetailScreen homeId={homeId} back={detailBack} go={go} accent={accent} r={r} source={source}/>
  }
  const source = parts[1] || null
  const listBack = source === 'settings' ? () => go('settings') : back
  return <HomesScreen back={listBack} go={go} accent={accent} r={r} source={source}/>
}
