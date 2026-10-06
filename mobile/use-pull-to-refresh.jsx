import { useEffect, useRef, useState } from 'react'

/**
 * 모바일 pull-to-refresh 훅.
 * 페이지가 맨 위에서 아래로 끌어내리면 임계값 도달 시 onRefresh() 호출.
 *
 * @param {() => Promise<any>} onRefresh
 * @param {{ enabled?: boolean, threshold?: number }} opts
 */
export function usePullToRefresh(onRefresh, { enabled = true, threshold = 70 } = {}) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  // listener 가 매 setPull 마다 재등록되지 않게 mutable state 는 ref 로 관리
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])
  useEffect(() => { refreshingRef.current = refreshing }, [refreshing])

  useEffect(() => {
    if (!enabled) return
    let startY = null
    let lastDelta = 0

    const onStart = (e) => {
      if (refreshingRef.current) return
      if (window.scrollY > 0) return
      if (e.touches.length !== 1) return  // 멀티터치(핀치) 무시
      // 진짜 가로/세로 드래그가 본업인 위젯에서만 PTR 비활성. 일반 버튼은 통과.
      const target = e.target
      if (target && target.closest && target.closest('input[type="range"], [role="slider"]')) return
      startY = e.touches[0].clientY
      lastDelta = 0
    }

    const onMove = (e) => {
      if (startY == null) return
      const delta = e.touches[0].clientY - startY
      if (delta <= 0) {
        setPull(0)
        return
      }
      // 시스템 PTR / 일반 스크롤 차단
      if (e.cancelable) e.preventDefault()
      lastDelta = delta
      setPull(Math.min(delta * 0.5, threshold * 1.5))
    }

    const onEnd = async () => {
      if (startY == null) return
      const exceeded = lastDelta * 0.5 >= threshold
      startY = null
      lastDelta = 0
      if (exceeded && !refreshingRef.current) {
        setRefreshing(true)
        setPull(threshold)
        try { await onRefreshRef.current() } catch {}
        setRefreshing(false)
        setPull(0)
      } else {
        setPull(0)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, threshold])  // pull / refreshing / onRefresh 는 ref 경유 → 의존성에서 제외

  return { pull, refreshing, threshold }
}

export function PullToRefreshIndicator({ pull, refreshing, threshold = 70, accent = '#e8a23c' }) {
  if (pull <= 0 && !refreshing) return null
  const ratio = Math.min(pull / threshold, 1)
  const dashArray = `${ratio * 62.8} 62.8`
  const visible = pull > 4 || refreshing
  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        display: 'flex', justifyContent: 'center',
        transform: `translateY(${Math.min(pull, threshold) - 38}px)`,
        transition: refreshing ? 'transform 200ms' : 'none',
        pointerEvents: 'none',
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 18,
          background: 'rgba(20,16,13,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: visible ? 1 : 0,
          transition: 'opacity 150ms',
        }}>
          {refreshing ? (
            <div style={{
              width: 18, height: 18, borderRadius: 9,
              border: `2px solid ${accent}55`,
              borderTopColor: accent,
              animation: 'ptr-spin 0.8s linear infinite',
            }}/>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke={accent + '33'} strokeWidth="2"/>
              <circle cx="12" cy="12" r="10" stroke={accent} strokeWidth="2"
                strokeDasharray={dashArray} strokeLinecap="round"
                transform="rotate(-90 12 12)"/>
            </svg>
          )}
        </div>
      </div>
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
