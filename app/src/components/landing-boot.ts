// What the taste kit reads from <html> on the landing page. Shared by the inline script in
// landing.tsx (a full page load, before the first paint) and LandingKit (a client-side
// navigation to the landing, such as signing out, where that script never runs).

export const LANDING_HTML_ATTRS: Record<string, string> = {
  "data-type": "product",
  "data-radius": "soft",
  "data-buttons": "block",
  "data-ground": "sage",
  "data-motion": "",
};

// m-enter holds the hero's words for motion.js (700ms at most); mo-js marks the moments as live.
export const LANDING_BOOT = `(function(){var h=document.documentElement,a=${JSON.stringify(LANDING_HTML_ATTRS)};
for(var k in a)h.setAttribute(k,a[k]);
h.classList.add("m-enter","mo-js");
setTimeout(function(){h.classList.add("m-enter-done")},700);setTimeout(function(){h.classList.add("mo-safe")},2500);})();`;
