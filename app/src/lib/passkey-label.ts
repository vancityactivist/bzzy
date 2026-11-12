// A readable name for a new passkey, from the browser that registered it:
// "Chrome on Mac", "Safari on iPhone". Only a hint: a passkey made on a phone
// by scanning a QR code is labelled after the computer's browser.

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

const match = (ua: string, list: [RegExp, string][]) => list.find(([re]) => re.test(ua))?.[1];

export function passkeyLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = match(ua, BROWSERS);
  const system = match(ua, SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Passkey";
}
