import { useEffect, useRef, useState } from "react";

const THRESHOLD = 72;

/**
 * Pull down from the top of the page to refresh (touch only). Returns how far the user has
 * pulled so the UI can show an indicator; fires onRefresh once when released past the threshold.
 */
export function usePullToRefresh(onRefresh: () => void, enabled: boolean): { pull: number; armed: boolean } {
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const latest = useRef(onRefresh);
  latest.current = onRefresh;
  const pullRef = useRef(0);

  useEffect(() => {
    if (!enabled) { setPull(0); return; }
    const set = (v: number) => { pullRef.current = v; setPull(v); };
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0]!.clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0]!.clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { set(0); return; }
      set(Math.min(110, dy * 0.5));
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD / 2) latest.current();
      set(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  return { pull, armed: pull >= THRESHOLD / 2 };
}
