export function initDragScroll() {
  if (typeof window === 'undefined') return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Find all scrollable elements and attach listeners
  function attachToScrollable(track: HTMLElement) {
    let isDown = false;
    let startX = 0, startScroll = 0;
    let lastX = 0, lastT = 0, velocity = 0;
    let momentumId: number | null = null;
    let moved = false;

    function cancelMomentum() {
      if (momentumId) {
        cancelAnimationFrame(momentumId);
        momentumId = null;
      }
    }

    function onPointerDown(e: PointerEvent) {
      isDown = true;
      moved = false;
      track.classList.add('dragging');
      track.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startScroll = track.scrollLeft;
      lastX = e.clientX;
      lastT = performance.now();
      velocity = 0;
      cancelMomentum();
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      track.scrollLeft = startScroll - dx;

      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) {
        velocity = (e.clientX - lastX) / dt;
      }
      lastX = e.clientX;
      lastT = now;
    }

    function onPointerUp(e: PointerEvent) {
      if (!isDown) return;
      isDown = false;
      track.classList.remove('dragging');

      if (!prefersReduced) beginMomentum();

      if (moved) {
        const suppress = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
          track.removeEventListener('click', suppress, true);
        };
        track.addEventListener('click', suppress, true);
      }
    }

    function beginMomentum() {
      function step() {
        track.scrollLeft -= velocity * 16;
        velocity *= 0.94;
        if (Math.abs(velocity) > 0.02) {
          momentumId = requestAnimationFrame(step);
        } else {
          momentumId = null;
        }
      }
      momentumId = requestAnimationFrame(step);
    }

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', onPointerUp);
    track.addEventListener('pointercancel', onPointerUp);
    track.addEventListener('pointerleave', (e) => {
      if (isDown) onPointerUp(e);
    });
  }

  // Find and attach to all scrollable containers
  const scrollables = document.querySelectorAll<HTMLElement>('[style*="overflow-x"], .overflow-x-auto, .overflow-x-scroll');
  scrollables.forEach((el) => {
    const style = getComputedStyle(el);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
      attachToScrollable(el);
    }
  });

  // Use MutationObserver for dynamically added elements
  const observer = new MutationObserver(() => {
    const newScrollables = document.querySelectorAll<HTMLElement>('[style*="overflow-x"], .overflow-x-auto, .overflow-x-scroll');
    newScrollables.forEach((el) => {
      const style = getComputedStyle(el);
      if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
        // Check if not already attached (simple check via data attribute)
        if (!el.hasAttribute('data-drag-attached')) {
          el.setAttribute('data-drag-attached', 'true');
          attachToScrollable(el);
        }
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
