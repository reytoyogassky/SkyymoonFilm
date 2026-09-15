export function initDragScroll() {
  if (typeof window === 'undefined') return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const attached = new WeakSet<HTMLElement>();

  function attachDragToTrack(track: HTMLElement) {
    // Prevent duplicate attachment
    if (attached.has(track)) return;
    attached.add(track);

    let isDown = false;
    let startX = 0, startScroll = 0;
    let lastX = 0, lastT = 0, velocity = 0;
    let momentumId: number | null = null;
    let moved = false;
    let clickTarget: HTMLElement | null = null;

    function cancelMomentum() {
      if (momentumId) {
        cancelAnimationFrame(momentumId);
        momentumId = null;
      }
    }

    function onPointerDown(e: PointerEvent) {
      isDown = true;
      moved = false;
      clickTarget = e.target as HTMLElement;
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
      const dy = e.clientY - (e as any).clientY; // Check if we have Y movement too
      
      if (Math.abs(dx) > 15) { // Increased to 15px for more tolerance
        moved = true;
        // Prevent click if moved
        if (clickTarget) {
          const link = clickTarget.closest('a');
          if (link) {
            const suppress = (ev: Event) => {
              ev.preventDefault();
              ev.stopPropagation();
            };
            link.addEventListener('click', suppress, { once: true, capture: true });
          }
        }
      }
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
      clickTarget = null;
      track.classList.remove('dragging');
      if (!prefersReduced && moved) beginMomentum();
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

  function scanAndAttach() {
    // Find all elements with overflow-x scroll
    const all = document.querySelectorAll('*');
    all.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const style = getComputedStyle(htmlEl);
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        htmlEl.scrollWidth > htmlEl.clientWidth + 4
      ) {
        attachDragToTrack(htmlEl);
      }
    });
  }

  // Initial scan
  scanAndAttach();

  // Scan again after dynamic content loads
  setTimeout(scanAndAttach, 500);
  setTimeout(scanAndAttach, 1500);

  // Listen for route changes (Next.js)
  if (typeof window !== 'undefined') {
    const observer = new MutationObserver(() => {
      scanAndAttach();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}
