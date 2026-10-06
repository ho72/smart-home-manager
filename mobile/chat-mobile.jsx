import { useState, useEffect, useRef } from 'react'
import { PALETTE, Spinner } from '../components/shared'
import { MobileHeader } from './shared-mobile'
import { api } from '../src/api.js'

// 한 번에 백엔드로 보낼 history 최대 길이 (system + user/assistant 페어).
// 백엔드 모델은 max 20 개 — 그 이하로 유지.
const HISTORY_LIMIT = 16

const TOOL_LABELS = {
  control_device: '디바이스 제어',
  create_automation: '자동화 추가',
  toggle_automation: '자동화 토글',
  delete_automation: '자동화 삭제',
}

function ExecutedChips({ executed, accent }) {
  if (!executed || executed.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {executed.map((e, i) => {
        const label = TOOL_LABELS[e.tool] || e.tool
        const ok = !!e.ok
        const detail = e.label
          ? `${e.label}${e.action ? ` · ${e.action}` : ''}`
          : e.automation?.name || e.name || (e.id ? `#${e.id}` : '')
        return (
          <div key={i} style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 999,
            background: ok ? accent + '22' : PALETTE.charcoal.warn + '22',
            border: `1px solid ${ok ? accent + '55' : PALETTE.charcoal.warn + '55'}`,
            color: ok ? accent : PALETTE.charcoal.warn,
            display: 'flex', alignItems: 'center', gap: 4,
            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={e.error || ''}>
            <span style={{ fontWeight: 600 }}>{label}</span>
            {detail && <span style={{ opacity: 0.85 }}>· {detail}</span>}
            {!ok && <span>✕</span>}
          </div>
        )
      })}
    </div>
  )
}

function Bubble({ role, text, executed, accent }) {
  const isUser = role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      padding: '0 4px',
    }}>
      <div style={{
        maxWidth: '85%',
        background: isUser ? accent : PALETTE.charcoal.card,
        color: isUser ? '#14100d' : PALETTE.charcoal.text,
        border: isUser ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
        padding: '10px 14px', borderRadius: 16,
        borderTopRightRadius: isUser ? 4 : 16,
        borderTopLeftRadius: isUser ? 16 : 4,
        fontSize: 14, lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {text}
        {!isUser && <ExecutedChips executed={executed} accent={accent}/>}
      </div>
    </div>
  )
}

export function ChatMobile({ back, tweaks }) {
  const accent = tweaks.accent
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '안녕하세요. 무엇을 도와드릴까요?\n예) "침실3 불 꺼줘", "1시간 뒤에 공기청정기 꺼줘"' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    // 백엔드 history 는 user/assistant 만 보내고, 환영 메시지(첫 assistant)는 제외.
    // — 모델이 그걸 자기 답변으로 착각해서 같은 인사말을 반복하는 걸 방지.
    const histForBackend = messages
      .slice(1)
      .slice(-HISTORY_LIMIT)
      .map(m => ({ role: m.role, content: m.content }))
    setMessages(m => [...m, { role: 'user', content: text }])
    setInput('')
    setLoading(true)
    try {
      const res = await api.llmChat(text, histForBackend)
      setMessages(m => [...m, {
        role: 'assistant',
        content: res?.reply || '(빈 응답)',
        executed: res?.executed || [],
      }])
    } catch (e) {
      setMessages(m => [...m, {
        role: 'assistant',
        content: '⚠ 호출 실패: ' + (e.message || String(e)),
      }])
    } finally {
      setLoading(false)
      // 모바일 키보드 유지하려면 input 에 다시 포커스
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      <MobileHeader title="채팅" onBack={back} accent={accent}/>
      <div ref={scrollRef} style={{
        position: 'absolute', top: 54, bottom: 0, left: 0, right: 0,
        paddingTop: 'max(54px, calc(env(safe-area-inset-top) + 54px))',
        marginTop: -54,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        // 입력바 만큼 padding-bottom — 마지막 메시지 가려지지 않게.
        paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
      }}>
        <div style={{
          padding: '12px 12px 8px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.content} executed={m.executed} accent={accent}/>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '0 4px' }}>
              <div style={{
                background: PALETTE.charcoal.card,
                border: `1px solid ${PALETTE.charcoal.line}`,
                padding: '10px 14px', borderRadius: 16, borderTopLeftRadius: 4,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Spinner color={accent} size={14}/>
                <span style={{ fontSize: 12, color: PALETTE.charcoal.dim }}>생각 중…</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar — sticky bottom */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        padding: '10px 12px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        background: 'rgba(20,16,13,0.94)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderTop: `1px solid ${PALETTE.charcoal.line}`,
        display: 'flex', gap: 8, alignItems: 'flex-end',
        zIndex: 25,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="메시지를 입력하세요"
          rows={1}
          style={{
            flex: 1, minHeight: 44, maxHeight: 120,
            background: PALETTE.charcoal.card,
            border: `1px solid ${PALETTE.charcoal.line}`,
            color: PALETTE.charcoal.text,
            borderRadius: 14, padding: '11px 14px',
            fontSize: 14, lineHeight: 1.4,
            fontFamily: 'inherit', resize: 'none', outline: 'none',
          }}
          disabled={loading}/>
        <button onClick={send} disabled={!input.trim() || loading} style={{
          height: 44, padding: '0 18px', borderRadius: 14,
          background: !input.trim() || loading ? '#2a231c' : accent,
          color: !input.trim() || loading ? PALETTE.charcoal.dim : '#14100d',
          border: 'none', cursor: !input.trim() || loading ? 'default' : 'pointer',
          fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
          flexShrink: 0,
        }}>전송</button>
      </div>
    </>
  )
}
