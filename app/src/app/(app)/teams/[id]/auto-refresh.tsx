"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Stops refreshing after this long with nobody touching the page, so a tab left open all
// day doesn't cost as much as another light. Any click, key, scroll or coming back to the
// tab refreshes straight away and starts it again.
const IDLE_AFTER_MS = 10 * 60_000;

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

// Re-renders the page on the devices' own 20 s rhythm while the tab is visible and in use,
// and straight away when you come back to it. No sockets: it's just the server page again.
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let lastActive = Date.now();
    const visible = () => document.visibilityState === "visible";
    const idle = () => Date.now() - lastActive >= IDLE_AFTER_MS;

    const tick = () => {
      if (visible() && !idle()) router.refresh();
    };
    const onActivity = () => {
      const wasIdle = idle();
      lastActive = Date.now();
      if (wasIdle && visible()) router.refresh();
    };
    const onVisibility = () => {
      if (!visible()) return;
      lastActive = Date.now();
      router.refresh();
    };

    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", onVisibility);
    for (const e of ACTIVITY) window.addEventListener(e, onActivity, { passive: true });
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const e of ACTIVITY) window.removeEventListener(e, onActivity);
    };
  }, [router, seconds]);
  return null;
}
