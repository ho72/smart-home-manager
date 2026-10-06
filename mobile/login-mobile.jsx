import { api } from '../src/api.js'
import { PALETTE, IconHome } from '../components/shared'

export function LoginMobile({ error }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: PALETTE.charcoal.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 28px',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
    }}>

      <div style={{ marginBottom: 44, textAlign: 'center' }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 22,
          background: PALETTE.charcoal.card,
          border: `1px solid ${PALETTE.charcoal.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px',
        }}>
          <IconHome size={36} color={PALETTE.charcoal.accent}/>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, color: PALETTE.charcoal.text, letterSpacing: 0 }}>
          nook
        </div>
        <div style={{ fontSize: 13, color: PALETTE.charcoal.dim, marginTop: 6, letterSpacing: 0.4 }}>
          스마트 홈 컨트롤
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          background: PALETTE.charcoal.card,
          border: `1px solid ${PALETTE.charcoal.line}`,
          borderRadius: 14,
          padding: '16px 18px',
          color: PALETTE.charcoal.dim,
          fontSize: 13,
          lineHeight: 1.55,
          textAlign: 'center',
        }}>
          nook 계정은 Unipass에서 관리합니다. 로그인 후 다시 nook로 돌아옵니다.
        </div>

        {error && (
          <div style={{
            color: PALETTE.charcoal.warn,
            fontSize: 13,
            textAlign: 'center',
            padding: '2px 0',
          }}>{error}</div>
        )}

        <button
          type="button"
          onClick={() => api.startUnipassLogin()}
          style={{
            height: 56,
            borderRadius: 14,
            border: 'none',
            cursor: 'pointer',
            background: PALETTE.charcoal.accent,
            color: '#14100d',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'inherit',
            transition: 'background 200ms',
          }}
        >
          Unipass로 계속
        </button>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        fontSize: 10,
        color: PALETTE.charcoal.dimDeep,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
      }}>
        nook · v1.0
      </div>
    </div>
  )
}
