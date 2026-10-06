import { useState, useEffect } from 'react'

export const PALETTE = {
  charcoal: {
    bg:       '#14100d',
    card:     '#1f1914',
    cardAlt:  '#271f18',
    header:   '#17130f',
    line:     '#2c241c',
    text:     '#f4ece0',
    dim:      '#8a7b6a',
    dimDeep:  '#5a4e42',
    accent:   '#e8a23c',   // amber
    accent2:  '#c97b2c',   // deeper amber
    on:       '#7dba6b',
    off:      '#3a322a',
    warn:     '#d85a4a',
  },
};

export function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return t;
}
export function fmtTime(d) {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { hm: `${h}:${m}`, ap };
}

// ── Minimal line icons (stroke primitives, ESP32-friendly) ────────────────
// Each icon is an SVG so we can stroke cleanly; on device these translate to
// a handful of drawLine/drawCircle calls.

export function IconFan({ size = 28, color = '#f4ece0', spinning = false, speed = 1 }) {
  // 4 petals + hub. Implementable on device with 4 fillCircle + center.
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" style={{
      display:'block',
      animation: spinning ? `fanSpin ${Math.max(0.4, 2.4 / speed)}s linear infinite` : 'none',
      transformOrigin: '50% 50%',
    }}>
      <circle cx="20" cy="20" r="17" fill="none" stroke={color} strokeWidth="1.2" opacity="0.22"/>
      {[0,90,180,270].map(a => (
        <g key={a} transform={`rotate(${a} 20 20)`}>
          <path d="M20 20 C22 12, 26 7, 22 4 C16 5, 14 12, 20 20 Z"
                fill={color} opacity="0.9"/>
        </g>
      ))}
      <circle cx="20" cy="20" r="3.4" fill="#14100d"/>
      <circle cx="20" cy="20" r="2" fill={color}/>
    </svg>
  );
}

export function IconBulb({ size = 28, color = '#f4ece0', glow = false }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" style={{ display: 'block' }}>
      {glow && (
        <circle cx="20" cy="17" r="16" fill={color} opacity="0.18">
          <animate attributeName="opacity" values="0.12;0.28;0.12" dur="2.4s" repeatCount="indefinite"/>
        </circle>
      )}
      <path d="M20 5 C13 5, 9 10, 9 16 C9 20, 11 22, 13 25 L13 28 L27 28 L27 25 C29 22, 31 20, 31 16 C31 10, 27 5, 20 5 Z"
            fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M14 31 L26 31 M15 34 L25 34" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export function IconBack({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M15 5 L8 12 L15 19" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconChevron({ size = 18, color = '#8a7b6a' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M9 6 L15 12 L9 18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconWifi({ size = 16, color = '#7dba6b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M3 9 C8 4, 16 4, 21 9" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.45"/>
      <path d="M6 12 C10 8, 14 8, 18 12" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
      <path d="M9 15 C11 13, 13 13, 15 15" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="12" cy="18" r="1.3" fill={color}/>
    </svg>
  );
}
export function IconMoon({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M20 14 C19 17, 16 19, 12 19 C7 19, 4 15, 4 11 C4 7, 7 4, 11 4 C10 8, 12 13, 20 14 Z"
            fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconLeaf({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M5 19 C5 11, 11 5, 19 5 C19 13, 13 19, 5 19 Z" fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M5 19 L14 10" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
export function IconFilm({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke={color} strokeWidth="1.6"/>
      <path d="M4 9 L20 9 M4 15 L20 15 M8 5 L8 19 M16 5 L16 19" stroke={color} strokeWidth="1.2" opacity="0.5"/>
    </svg>
  );
}
export function IconHome({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M4 11 L12 4 L20 11 L20 20 L4 20 Z" fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconAC({ size = 28, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display:'block' }}>
      <rect x="5" y="10" width="30" height="14" rx="3" fill="none" stroke={color} strokeWidth="1.6"/>
      <line x1="8" y1="16" x2="32" y2="16" stroke={color} strokeWidth="1.2" opacity="0.6"/>
      <line x1="8" y1="20" x2="32" y2="20" stroke={color} strokeWidth="1.2" opacity="0.6"/>
      <path d="M12 27 Q14 30 12 33 M20 27 Q22 30 20 33 M28 27 Q30 30 28 33"
            fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
export function IconHumid({ size = 28, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display:'block' }}>
      <path d="M20 5 C13 14, 10 20, 10 25 C10 31, 14 35, 20 35 C26 35, 30 31, 30 25 C30 20, 27 14, 20 5 Z"
            fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M15 25 C15 28, 17 30, 20 30" fill="none" stroke={color} strokeWidth="1.3" opacity="0.6" strokeLinecap="round"/>
    </svg>
  );
}
export function IconSettings({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <circle cx="12" cy="12" r="3" fill="none" stroke={color} strokeWidth="1.7"/>
      <path d="M12 3 L12 6 M12 18 L12 21 M3 12 L6 12 M18 12 L21 12 M5.6 5.6 L7.7 7.7 M16.3 16.3 L18.4 18.4 M5.6 18.4 L7.7 16.3 M16.3 7.7 L18.4 5.6"
            stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}
export function IconCloud({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M7 17 C4 17, 3 15, 3 13 C3 11, 5 9, 7 9 C7 6, 10 4, 13 5 C15 5, 17 7, 17 9 C20 9, 21 11, 21 13 C21 15, 20 17, 17 17 Z"
            fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconLock({ size = 16, color = '#8a7b6a' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke={color} strokeWidth="1.7"/>
      <path d="M8 11 L8 7 C8 5, 10 3, 12 3 C14 3, 16 5, 16 7 L16 11" fill="none" stroke={color} strokeWidth="1.7"/>
    </svg>
  );
}
export function IconCheck({ size = 16, color = '#7dba6b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M5 13 L10 18 L19 7" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconSignal({ size = 16, color = '#f4ece0', bars = 3 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      {[1,2,3,4].map(i => (
        <rect key={i} x={2 + (i-1) * 5} y={22 - i * 4} width="3" height={i * 4}
              fill={i <= bars ? color : '#3a322a'} rx="0.5"/>
      ))}
    </svg>
  );
}

export function IconBolt({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M13 2 L4 14 L11 14 L10 22 L20 9 L13 9 Z"
            fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconPlus({ size = 18, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M12 5 L12 19 M5 12 L19 12" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
export function IconClock({ size = 20, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="1.7"/>
      <path d="M12 7 L12 12 L16 14" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconThermo({ size = 20, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M14 14 L14 5 C14 3.5, 13 2.5, 12 2.5 C11 2.5, 10 3.5, 10 5 L10 14 C8.8 14.8, 8 16.2, 8 17.5 C8 19.7, 9.8 21.5, 12 21.5 C14.2 21.5, 16 19.7, 16 17.5 C16 16.2, 15.2 14.8, 14 14 Z"
            fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <circle cx="12" cy="17.5" r="1.8" fill={color}/>
    </svg>
  );
}
export function IconTrash({ size = 18, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M5 7 L19 7 M9 7 L9 4 L15 4 L15 7 M7 7 L8 20 L16 20 L17 7 M10 11 L10 17 M14 11 L14 17"
            fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconLink({ size = 20, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M10 14 L14 10 M9 8 L7 10 C5 12, 5 15, 7 17 C9 19, 12 19, 14 17 L15 16 M15 16 L17 14 C19 12, 19 9, 17 7 C15 5, 12 5, 10 7 L9 8"
            fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function IconBlind({ size = 28, color = '#f4ece0', level = 100 }) {
  // level 0 = fully closed (slats fill window), 100 = fully open (slats stacked at top)
  const lv = Math.max(0, Math.min(100, level));
  const closedFrac = (100 - lv) / 100;
  const top = 4;
  const bottom = 20;
  const closedHeight = (bottom - top) * closedFrac;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke={color} strokeWidth="1.6"/>
      {/* head rail */}
      <line x1="3" y1="6" x2="21" y2="6" stroke={color} strokeWidth="1.6"/>
      {/* shaded portion */}
      {closedHeight > 0 && (
        <rect x="4.5" y={top + 2} width="15" height={closedHeight - 0.5} fill={color} opacity="0.55"/>
      )}
      {/* slat lines on closed portion */}
      {closedHeight > 4 && (
        <>
          <line x1="5" y1={top + 5} x2="19" y2={top + 5} stroke={color} strokeOpacity="0.85" strokeWidth="1"/>
          {closedHeight > 8 && <line x1="5" y1={top + 8} x2="19" y2={top + 8} stroke={color} strokeOpacity="0.85" strokeWidth="1"/>}
          {closedHeight > 11 && <line x1="5" y1={top + 11} x2="19" y2={top + 11} stroke={color} strokeOpacity="0.85" strokeWidth="1"/>}
          {closedHeight > 14 && <line x1="5" y1={top + 14} x2="19" y2={top + 14} stroke={color} strokeOpacity="0.85" strokeWidth="1"/>}
        </>
      )}
      {/* pull cord */}
      <line x1="20" y1="3" x2="20" y2="9" stroke={color} strokeOpacity="0.6" strokeWidth="0.8"/>
    </svg>
  );
}
export function IconWidgets({ size = 20, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" fill="none" stroke={color} strokeWidth="1.6"/>
      <rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke={color} strokeWidth="1.6"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke={color} strokeWidth="1.6"/>
      <path d="M17 13 L17 21 M13 17 L21 17" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
export function IconSensor({ size = 20, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <circle cx="12" cy="12" r="2.5" fill={color}/>
      <path d="M7.5 7.5 C5 10, 5 14, 7.5 16.5 M16.5 7.5 C19 10, 19 14, 16.5 16.5"
            fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M4 4 C1 7.5, 1 16.5, 4 20 M20 4 C23 7.5, 23 16.5, 20 20"
            fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}
export function IconScale({ size = 22, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <rect x="4" y="5" width="16" height="14" rx="3" fill="none" stroke={color} strokeWidth="1.7"/>
      <path d="M8 10 C9.1 8.8, 10.4 8.2, 12 8.2 C13.6 8.2, 14.9 8.8, 16 10"
            fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 8.4 L13.8 11.4" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="1.1" fill={color}/>
    </svg>
  );
}
export function IconButton({ size = 20, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth="1.6"/>
      <circle cx="12" cy="12" r="4" fill="none" stroke={color} strokeWidth="1.6"/>
    </svg>
  );
}
export function IconWind({ size = 28, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display:'block' }}>
      <path d="M3 8 H13 a3 3 0 1 0 -3 -3"/>
      <path d="M3 12 H17 a3.5 3.5 0 1 1 -3.5 3.5"/>
      <path d="M3 16 H8"/>
    </svg>
  );
}
export function IconSparkle({ size = 20, color = '#f4ece0' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:'block' }}>
      <path d="M12 3 L13.5 10.5 L21 12 L13.5 13.5 L12 21 L10.5 13.5 L3 12 L10.5 10.5 Z"
            fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Loading overlay ───────────────────────────────────────────────────────
// Semi-transparent dim + centered spinner. Used during screen transitions
// while the device syncs state via HTTP.

export function LoadingOverlay({ show, accent = '#e8a23c', variant = 'spinner' }) {
  if (!show) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(20, 16, 13, 0.72)',
      backdropFilter: 'blur(2px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14,
      animation: 'overlayFade 180ms ease-out',
    }}>
      {variant === 'spinner' && <Spinner color={accent} />}
      {variant === 'dots' && <Dots color={accent} />}
      {variant === 'bar' && <Bar color={accent} />}
      <div style={{
        color: '#d0c4b3', fontSize: 13, letterSpacing: 0.5,
        fontWeight: 500, opacity: 0.85,
      }}>Syncing…</div>
    </div>
  );
}

export function Spinner({ color = '#e8a23c', size = 42 }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      border: `3px solid ${color}22`,
      borderTopColor: color,
      animation: 'spin 0.9s linear infinite',
    }}/>
  );
}
export function Dots({ color = '#e8a23c' }) {
  return (
    <div style={{ display:'flex', gap:8 }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width:10, height:10, borderRadius:'50%', background: color,
          animation: `dotBounce 1.2s ease-in-out ${i*0.15}s infinite`,
        }}/>
      ))}
    </div>
  );
}
export function Bar({ color = '#e8a23c' }) {
  return (
    <div style={{
      width: 160, height: 4, borderRadius: 2,
      background: `${color}22`, overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%',
        background: color, borderRadius: 2,
        animation: 'barSlide 1.4s ease-in-out infinite',
      }}/>
    </div>
  );
}

// ── Common primitives ───────────────────────────────────────────────────
// Every component sized for touch: min 44px hit areas, mostly 56px+.

export function BitmapText({ children, size = 2, color = '#f4ece0', bold = false, style = {} }) {
  // Mimics Arduino_GFX bitmap text; size 1 = 6x8, size 2 = 12x16.
  const fontSize = { 1: 10, 2: 13, 3: 18, 4: 24, 5: 32 }[size] || size * 8;
  return (
    <span style={{
      color, fontSize,
      fontWeight: bold ? 700 : 500,
      letterSpacing: size >= 3 ? -0.5 : 0.2,
      lineHeight: 1,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      ...style,
    }}>{children}</span>
  );
}
