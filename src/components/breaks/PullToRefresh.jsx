import React, { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

const THRESHOLD = 70;

export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const onStart = (e) => {
      if (window.scrollY <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      } else {
        pulling.current = false;
      }
    };
    const onMove = (e) => {
      if (!pulling.current || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        e.preventDefault();
        const next = Math.min(dy * 0.5, 110);
        pullRef.current = next;
        setPull(next);
      }
    };
    const onEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      const p = pullRef.current;
      if (p >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        pullRef.current = THRESHOLD;
        try {
          await onRefreshRef.current();
        } finally {
          setRefreshing(false);
          setPull(0);
          pullRef.current = 0;
        }
      } else {
        setPull(0);
        pullRef.current = 0;
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refreshing]);

  return (
    <div>
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-150"
        style={{ height: pull }}
      >
        {refreshing ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <RefreshCw
            className="w-5 h-5 text-muted-foreground"
            style={{ opacity: Math.min(pull / THRESHOLD, 1) }}
          />
        )}
      </div>
      {children}
    </div>
  );
}