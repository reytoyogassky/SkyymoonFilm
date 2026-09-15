export function initDragScroll() {
  if (typeof window === 'undefined') return;

  let drag: { sc: HTMLElement; x: number; left: number; moved: number } | null = null;

  function findScroller(el: HTMLElement | null): HTMLElement | null {
    while (el && el !== document.body) {
      if (el.scrollWidth > el.clientWidth + 4) {
        const ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll') return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (e.button) return;
      const sc = findScroller(e.target as HTMLElement);
      if (!sc) return;
      sc.style.scrollBehavior = 'auto';
      drag = { sc, x: e.clientX, left: sc.scrollLeft, moved: 0 };
    },
    true
  );

  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      if (drag.moved > 4) {
        drag.sc.scrollLeft = drag.left - dx;
        drag.sc.style.cursor = 'grabbing';
        if (e.cancelable) e.preventDefault();
      }
    },
    { passive: false, capture: true }
  );

  function end() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.sc.style.cursor = '';
    d.sc.style.scrollBehavior = '';
    if (d.moved > 6) {
      const stop = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        document.removeEventListener('click', stop, true);
      };
      document.addEventListener('click', stop, true);
      setTimeout(() => {
        document.removeEventListener('click', stop, true);
      }, 120);
    }
  }

  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
}
