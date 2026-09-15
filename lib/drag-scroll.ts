export function initDragScroll() {
  if (typeof window === 'undefined') return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const attached = new WeakSet<HTMLElement>();

  function attachDragToTrack(track: HTMLElement) {
    if (attached.has(track)) return;
    attached.add(track);

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
      if (e.button !== 0) return;
      // Check if we are actually inside this track
      if (!track.contains(e.target as Node)) return;
      isDown = true;
      moved = false;
      track.classList.add('dragging');
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
      if (Math.abs(dx) > 10) moved = true;
      track.scrollLeft = startScroll - dx;

      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) {
        velocity = (e.clientX - lastX) / dt;
      }
      lastX = e.clientX;
      lastT = now;
    }

    function onPointerUp() {
      if (!isDown) return;
      isDown = false;
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

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function scanAndAttach() {
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

  scanAndAttach();
  setTimeout(scanAndAttach, 500);
  setTimeout(scanAndAttach, 1500);

  const observer = new MutationObserver(() => {
    scanAndAttach();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
