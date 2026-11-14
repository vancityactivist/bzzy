"use client";

import { useEffect } from "react";

// The taste kit's scripts (public/assets). They change the DOM (word masks for the hero's
// entrance, the phone menu, the diagram, the moment), so they load after React has
// hydrated the landing page rather than as parser scripts that could race it.
const SCRIPTS = ["/assets/system.js", "/assets/motion/motion.js", "/assets/layout/layout.js", "/assets/diagrams/mount.js"];

export function LandingKit() {
  useEffect(() => {
    for (const src of SCRIPTS) {
      if (document.querySelector(`script[src="${src}"]`)) continue;
      const el = document.createElement("script");
      el.type = "module";
      el.src = src;
      document.body.append(el);
    }
  }, []);
  return null;
}
