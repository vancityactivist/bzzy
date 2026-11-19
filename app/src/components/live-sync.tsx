"use client";

// Keeps a server-rendered page in step with the light while it's open: every 20 s, while
// the tab is visible, ask /api/live whether anything the lights show has changed, and
// re-render the page when it has. Hidden tabs don't ask at all; coming back to one asks
// straight away. See lib/live-rules.ts.

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// How often an open, visible page checks: the same as a light's poll, so the preview is
// never more than one poll behind the light.
const LIVE_CHECK_MS = 20_000;
// Coming back to the tab or window checks at once, but not more often than this.
const MIN_GAP_MS = 5_000;
// A ticket that's run out is replaced by re-rendering the page; never more often than this.
const TICKET_RETRY_MS = 60_000;

export function LiveSync({ ticket, version }: { ticket: string; version: string | null }) {
  const router = useRouter();
  const ticketRef = useRef(ticket);
  // The version the page is showing (or is about to, after a refresh).
  const seen = useRef(version);
  // A refresh this component asked for, whose new version it already knows.
  const ours = useRef(false);

  useEffect(() => {
    ticketRef.current = ticket;
  }, [ticket]);

  useEffect(() => {
    // A re-render we asked for keeps the version that prompted it, so a page and a check
    // that ever disagree can't refresh each other forever. Any other re-render (the
    // person changed something here) is the newest there is.
    if (ours.current) ours.current = false;
    else seen.current = version;
  }, [version]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    let lastCheck = Date.now(); // the page was just rendered
    let lastTicketRetry = 0;
    let stopped = false;

    const schedule = () => {
      clearTimeout(timer);
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(check, LIVE_CHECK_MS);
    };

    const refresh = () => {
      ours.current = true;
      router.refresh();
    };

    async function check() {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      lastCheck = Date.now();
      try {
        const res = await fetch(`/api/live?t=${encodeURIComponent(ticketRef.current)}`, { cache: "no-store" });
        if (res.status === 401) {
          // Ran out (or the secret changed): a fresh render brings a new ticket.
          if (Date.now() - lastTicketRetry > TICKET_RETRY_MS) {
            lastTicketRetry = Date.now();
            router.refresh();
          }
        } else if (res.ok) {
          const { v } = (await res.json()) as { v: string | null };
          if (v !== seen.current) {
            seen.current = v;
            refresh();
          }
        }
      } catch {
        // Offline or a blip: try again next time.
      } finally {
        busy = false;
        schedule();
      }
    }

    const wake = () => {
      if (document.visibilityState !== "visible") {
        clearTimeout(timer);
        return;
      }
      if (Date.now() - lastCheck >= MIN_GAP_MS) void check();
      else schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    // iOS Safari brings pages back from the back/forward cache without a visibility change.
    window.addEventListener("pageshow", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, [router]);

  return null;
}
