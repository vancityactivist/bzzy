"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the page on the devices' own 20 s rhythm while the tab is visible, and
// straight away when you come back to it. No sockets: it's just the server page again.
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
