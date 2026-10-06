import { useRef, useState, useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'

// Reorderable — pointer-based drag-to-reorder that works on touch + mouse.
// Props:
//   items: array of { id, ... }
//   order: array of ids (source of truth — controlled)
//   onReorder: (newOrderIds) => void
//   editing: bool — drag only active when true
//   layout: 'row' | 'grid2' | 'list'   (row = horizontal, grid2 = 2-col, list = vertical)
//   gap: px
//   renderItem: (item, { dragging, editing }) => ReactNode
//
// Strategy: plain React state for the dragged item + current hover index.
// When editing, each cell becomes a press-to-grab handle (150ms hold to start).
// Items are rendered in DOM order matching `order` so measurement is reliable.

export function Reorderable({ items, order, onReorder, editing, layout = 'list', gap = 10, renderItem }) {
  const containerRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const [pointer, setPointer] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const pressTimerRef = useRef(null);
  const startPosRef = useRef(null);
  const dragStateRef = useRef({});

  const itemById = useMemo(() => {
    const m = {};
    items.forEach(it => { m[it.id] = it; });
    return m;
  }, [items]);

  const effectiveOrder = useMemo(() => {
    const existing = (order || []).filter(id => itemById[id]);
    const missing = items.filter(it => !existing.includes(it.id)).map(it => it.id);
    return [...existing, ...missing];
  }, [order, items]);

  const orderedItems = effectiveOrder.map(id => itemById[id]).filter(Boolean);

  useEffect(() => {
    if (!dragId) return;
    const onMove = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      setPointer({ x: pt.clientX, y: pt.clientY });
      if (e.cancelable && e.touches) e.preventDefault();
      // Compute hover index by scanning children positions
      const c = containerRef.current;
      if (!c) return;
      const cells = [...c.querySelectorAll('[data-reo-id]')];
      let best = null;
      let bestDist = Infinity;
      cells.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = pt.clientX - cx;
        const dy = pt.clientY - cy;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; best = idx; }
      });
      if (best !== null) setHoverIdx(best);
    };
    const onUp = () => {
      if (dragId && hoverIdx !== null) {
        const from = effectiveOrder.indexOf(dragId);
        if (from !== -1 && from !== hoverIdx) {
          const next = [...effectiveOrder];
          next.splice(from, 1);
          next.splice(hoverIdx, 0, dragId);
          onReorder(next);
        }
      }
      setDragId(null);
      setHoverIdx(null);
      setPointer(null);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragId, hoverIdx, effectiveOrder, onReorder]);

  const beginPress = (id, e) => {
    if (!editing) return;
    const pt = e.touches ? e.touches[0] : e;
    startPosRef.current = { x: pt.clientX, y: pt.clientY };
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      setDragId(id);
      setPointer({ x: pt.clientX, y: pt.clientY });
      if (navigator.vibrate) navigator.vibrate(18);
    }, 140);
  };
  const cancelPress = () => {
    clearTimeout(pressTimerRef.current);
  };
  const maybeCancelOnMove = (e) => {
    if (!startPosRef.current || dragId) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startPosRef.current.x;
    const dy = pt.clientY - startPosRef.current.y;
    if (Math.hypot(dx, dy) > 10) cancelPress();
  };

  const containerStyle = layout === 'grid2'
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap }
    : layout === 'grid4'
    ? { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap }
    : layout === 'row'
    ? { display: 'flex', gap, flexWrap: 'wrap' }
    : { display: 'flex', flexDirection: 'column', gap: 0 };

  return (
    <div ref={containerRef} style={{ ...containerStyle, position: 'relative', touchAction: editing ? 'none' : 'auto' }}>
      {orderedItems.map((it, idx) => {
        const isDragging = dragId === it.id;
        const isHoverSlot = dragId && hoverIdx === idx && !isDragging;
        return (
          <div key={it.id} data-reo-id={it.id}
               onPointerDown={(e) => beginPress(it.id, e)}
               onPointerMove={maybeCancelOnMove}
               onPointerUp={cancelPress}
               onPointerCancel={cancelPress}
               style={{
                 position: 'relative',
                 opacity: isDragging ? 0.35 : 1,
                 transform: isHoverSlot ? 'scale(0.98)' : 'scale(1)',
                 transition: 'transform 140ms ease, opacity 140ms ease',
                 filter: isHoverSlot ? 'brightness(1.15)' : 'none',
                 outline: isHoverSlot ? '2px dashed rgba(232,162,60,0.6)' : 'none',
                 outlineOffset: -2,
                 borderRadius: 14,
               }}>
            {renderItem(it, { dragging: isDragging, editing })}
          </div>
        );
      })}

      {/* Floating drag preview */}
      {dragId && pointer && (
        <DragGhost
          dragId={dragId}
          pointer={pointer}
          container={containerRef.current}
          renderItem={renderItem}
          item={itemById[dragId]}
          editing={editing}/>
      )}
    </div>
  );
}

function DragGhost({ dragId, pointer, container, renderItem, item, editing }) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!container) return;
    const el = container.querySelector(`[data-reo-id="${dragId}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    }
  }, [dragId, container]);
  if (!size) return null;
  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed',
      left: pointer.x - size.w / 2,
      top: pointer.y - size.h / 2,
      width: size.w, height: size.h,
      pointerEvents: 'none', zIndex: 500,
      transform: 'scale(1.04)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 0 2px rgba(232,162,60,0.8)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {renderItem(item, { dragging: false, editing, ghost: true })}
    </div>,
    document.body
  );
}
