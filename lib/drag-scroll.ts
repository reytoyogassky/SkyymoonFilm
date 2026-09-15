export function initDragScroll() {
  if (typeof window === 'undefined') return;

  let drag: { 
    sc: HTMLElement; 
    x: number; 
    left: number; 
    moved: number;
    startTime: number;
    lastX: number;
    lastTime: number;
  } | null = null;

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
      const now = Date.now();
      drag = { 
        sc, 
        x: e.clientX, 
        left: sc.scrollLeft, 
        moved: 0,
        startTime: now,
        lastX: e.clientX,
        lastTime: now
      };
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
        drag.sc.style.userSelect = 'none';
        drag.lastX = e.clientX;
        drag.lastTime = Date.now();
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
    d.sc.style.userSelect = '';
    
    // Calculate velocity for momentum
    const timeDiff = Date.now() - d.lastTime;
    const distDiff = d.lastX - d.x;
    
    if (d.moved > 6 && timeDiff < 100 && Math.abs(distDiff) > 10) {
      const velocity = distDiff / Math.max(timeDiff, 1);
      let momentum = velocity * 150; // amplify
      
      const decelerate = () => {
        momentum *= 0.92; // decay factor
        d.sc.scrollLeft -= momentum;
        if (Math.abs(momentum) > 0.5) {
          requestAnimationFrame(decelerate);
        } else {
          d.sc.style.scrollBehavior = '';
        }
      };
      requestAnimationFrame(decelerate);
      
      // Prevent clicks
      const stop = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        document.removeEventListener('click', stop, true);
      };
      document.addEventListener('click', stop, true);
      setTimeout(() => {
        document.removeEventListener('click', stop, true);
      }, 150);
    } else {
      d.sc.style.scrollBehavior = '';
    }
  }

  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
}
