export function initDragScroll() {
  if (typeof window === 'undefined') return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('pointerdown', (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    let track: HTMLElement | null = target;
    
    // Find scrollable container
    while (track && track !== document.body) {
      const style = getComputedStyle(track);
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        track.scrollWidth > track.clientWidth + 4
      ) {
        break;
      }
      track = track.parentElement;
    }
    
    if (!track || track === document.body) return;

    let isDown = true;
    let moved = false;
    const startX = e.clientX;
    const startScroll = track.scrollLeft;
    let lastX = e.clientX;
    let lastT = performance.now();
    let velocity = 0;
    let momentumId: number | null = null;

    track.classList.add('dragging');
    track.style.scrollSnapType = 'none';
    track.style.cursor = 'grabbing';
    track.style.userSelect = 'none';

    function cancelMomentum() {
      if (momentumId) {
        cancelAnimationFrame(momentumId);
        momentumId = null;
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      track!.scrollLeft = startScroll - dx;

      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) {
        velocity = (e.clientX - lastX) / dt;
      }
      lastX = e.clientX;
      lastT = now;
    }

    function beginMomentum() {
      function step() {
        track!.scrollLeft -= velocity * 16;
        velocity *= 0.94;
        if (Math.abs(velocity) > 0.02) {
          momentumId = requestAnimationFrame(step);
        } else {
          momentumId = null;
          track!.style.scrollSnapType = '';
        }
      }
      momentumId = requestAnimationFrame(step);
    }

    function onPointerUp() {
      if (!isDown) return;
      isDown = false;
      track!.classList.remove('dragging');
      track!.style.cursor = '';
      track!.style.userSelect = '';
      
      if (!prefersReduced && Math.abs(velocity) > 0.02) {
        beginMomentum();
      } else {
        track!.style.scrollSnapType = '';
      }

      if (moved) {
        const suppress = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
          track!.removeEventListener('click', suppress, true);
        };
        track!.addEventListener('click', suppress, true);
        setTimeout(() => {
          track!.removeEventListener('click', suppress, true);
        }, 100);
      }
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
    document.addEventListener('pointercancel', onPointerUp, { once: true });
  }, true);
}
