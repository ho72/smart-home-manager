import { useState } from 'react'
import { PALETTE, IconLink, IconChevron, IconBolt, IconCheck, IconHome } from '../components/shared'
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

function SectionHeader({ label }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: PALETTE.charcoal.dim,
      letterSpacing: 1, textTransform: 'uppercase',
      padding: '0 4px', marginBottom: 6, marginTop: 4,
    }}>{label}</div>
  )
}

function NavCard({ icon: Icon, label, sub, accent, r, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', background: PALETTE.charcoal.card,
      borderRadius: r + 2, padding: '14px 16px',
      border: `1px solid ${PALETTE.charcoal.line}`,
      display: 'flex', alignItems: 'center', gap: 14,
      cursor: 'pointer', textAlign: 'left', color: PALETTE.charcoal.text,
      minHeight: 64,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: accent + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} color={accent}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 2 }}>{sub}</div>}
      </div>
      <IconChevron size={16} color={PALETTE.charcoal.dim}/>
    </button>
  )
}

function GroupCard({ children, r }) {
  return (
    <div style={{
      background: PALETTE.charcoal.card, borderRadius: r + 2,
      border: `1px solid ${PALETTE.charcoal.line}`, overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

function GroupRow({ label, sub, right, onClick, last, accent }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '13px 16px', cursor: onClick ? 'pointer' : 'default',
      borderBottom: last ? 'none' : `1px solid ${PALETTE.charcoal.line}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

const LAYOUT_OPTIONS = [
  {
    id: 'free',
    label: '자유 배치',
    sub: '모든 기기를 한 화면에 자유롭게 배치',
    preview: '▤',
  },
  {
    id: 'sectioned',
    label: '공간별 섹션',
    sub: '집·사무실 등 공간별로 묶어 위아래로 표시',
    preview: '☰',
  },
  {
    id: 'tabbed',
    label: '공간별 탭',
    sub: '상단 탭으로 공간을 선택해 전환',
    preview: '⊟',
  },
]

function LayoutSheet({ current, onSelect, onClose, accent, r }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', zIndex: 200,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', background: '#1a1511',
        borderRadius: '18px 18px 0 0',
        padding: '20px 16px 40px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: PALETTE.charcoal.line,
          margin: '0 auto 20px',
        }}/>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, padding: '0 2px' }}>
          화면 레이아웃
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LAYOUT_OPTIONS.map(o => {
            const sel = (current || 'free') === o.id
            return (
              <button key={o.id} onClick={() => { onSelect(o.id); onClose() }} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: r + 2, border: 'none',
                background: sel ? accent + '18' : '#17130f',
                boxShadow: sel ? `inset 0 0 0 1px ${accent}66` : `inset 0 0 0 1px ${PALETTE.charcoal.line}`,
                cursor: 'pointer', textAlign: 'left', color: PALETTE.charcoal.text,
                fontFamily: 'inherit',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: sel ? accent + '22' : PALETTE.charcoal.line + '44',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, color: sel ? accent : PALETTE.charcoal.dim,
                }}>{o.preview}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{o.label}</div>
                  <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 2 }}>{o.sub}</div>
                </div>
                {sel && (
                  <div style={{
                    width: 20, height: 20, borderRadius: 999, background: accent, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconCheck size={11} color="#14100d"/>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function SettingsMobile({ tweaks, onChange, back, go }) {
  const r = tweaks.radius
  const accent = tweaks.accent
  const [showLayoutSheet, setShowLayoutSheet] = useState(false)

  return (
    <>
      <MobileHeader title="설정" onBack={back} accent={accent}/>
      <div style={{ padding: '14px 14px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* 계정 */}
        <div>
          <SectionHeader label="계정"/>
          <NavCard
            icon={IconUser} label="Unipass 계정 관리"
            sub="프로필, 이메일, 소셜 로그인"
            accent={accent} r={r}
            onClick={() => api.openUnipassAccount()}
          />
        </div>

        {/* 공간 */}
        <div>
          <SectionHeader label="공간"/>
          <NavCard
            icon={IconHome} label="홈 관리"
            sub="집·사무실 등 공간 추가, 멤버, 기기 연결"
            accent={accent} r={r}
            onClick={() => go('homes:settings')}
          />
        </div>

        {/* 화면 */}
        <div>
          <SectionHeader label="화면"/>
          <GroupCard r={r}>
            <GroupRow
              label="위젯" sub="내 화면에 표시할 기기·타일 관리"
              right={<IconChevron size={16} color={PALETTE.charcoal.dim}/>}
              onClick={() => go('widgets')}
              accent={accent}
            />
            <GroupRow
              label="자동화" sub="씬 버튼, 시간, 센서 트리거"
              right={<IconChevron size={16} color={PALETTE.charcoal.dim}/>}
              onClick={() => go('automations')}
              accent={accent}
            />
            <GroupRow
              label="레이아웃"
              sub={LAYOUT_OPTIONS.find(o => o.id === (tweaks.mainLayout || 'free'))?.label || '자유 배치'}
              right={<IconChevron size={16} color={PALETTE.charcoal.dim}/>}
              onClick={() => setShowLayoutSheet(true)}
              accent={accent}
              last
            />
          </GroupCard>
        </div>

        {/* 외관 */}
        <div>
          <SectionHeader label="외관"/>
          <div style={{
            background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
            border: `1px solid ${PALETTE.charcoal.line}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>강조 색상</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['#e8a23c','#d67a5a','#7ba58f','#8a9cd1','#c77dbe'].map(c => {
                const sel = accent === c
                return (
                  <button key={c} onClick={() => onChange({ accent: c })} style={{
                    flex: 1, height: 44, borderRadius: 12,
                    background: c, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: sel ? `0 0 0 3px #14100d, 0 0 0 5px ${c}` : 'none',
                    transition: 'box-shadow 120ms',
                  }}>
                    {sel && <IconCheck size={20} color="#14100d"/>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 시스템 */}
        <div>
          <SectionHeader label="시스템"/>
          <GroupCard r={r}>
            <GroupRow
              label="알림" sub="날씨 브리핑, 기기 알림"
              right={<IconChevron size={16} color={PALETTE.charcoal.dim}/>}
              onClick={() => go('notifications')}
              accent={accent}
            />
            <GroupRow
              label="정보" sub="nook · v1.0.2"
              accent={accent}
              last
            />
          </GroupCard>
        </div>

        <div style={{
          textAlign: 'center', fontSize: 10, color: PALETTE.charcoal.dimDeep,
          letterSpacing: 1.4, textTransform: 'uppercase',
        }}>
          nook · v1.0.2
        </div>
      </div>

      {showLayoutSheet && (
        <LayoutSheet
          current={tweaks.mainLayout}
          onSelect={v => onChange({ mainLayout: v })}
          onClose={() => setShowLayoutSheet(false)}
          accent={accent}
          r={r}
        />
      )}
    </>
  )
}

export function RowM({ label, sub, right, r }) {
  return (
    <div style={{
      background: PALETTE.charcoal.card, borderRadius: r + 2, padding: '16px 18px',
      border: `1px solid ${PALETTE.charcoal.line}`,
      display: 'flex', alignItems: 'center', minHeight: 72,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: PALETTE.charcoal.dim, marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}
