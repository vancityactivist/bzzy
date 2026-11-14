"use client";

import { useEffect, useLayoutEffect } from "react";

import { LANDING_HTML_ATTRS } from "./landing-boot";

// The taste kit's scripts (public/assets). They change the DOM (word masks for the hero's
// entrance, the phone menu, the diagram, the moment), so they load after React has
// hydrated the landing page rather than as parser scripts that could race it.
const SCRIPTS = ["/assets/system.js", "/assets/motion/motion.js", "/assets/layout/layout.js", "/assets/diagrams/mount.js"];

export function LandingKit() {
  // The kit's attributes on <html>. A full load already has them from the inline script in
  // landing.tsx; a client-side navigation here (signing out redirects to /) doesn't run it,
  // and without them the app's light tokens win and the cards turn white. Set them before
  // paint, and take them off again when leaving, so the app's tokens come back.
  useLayoutEffect(() => {
    const html = document.documentElement;
    for (const [k, v] of Object.entries(LANDING_HTML_ATTRS)) html.setAttribute(k, v);
    html.classList.add("m-enter-done", "mo-js", "mo-safe");
    return () => {
      for (const k of Object.keys(LANDING_HTML_ATTRS)) html.removeAttribute(k);
      html.classList.remove("m-enter", "m-enter-done", "mo-js", "mo-safe");
    };
  }, []);

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
