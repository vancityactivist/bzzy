// Email bodies. Pure, so they're unit-tested; lib/mail.ts sends them. Each one has a
// plain-text part and an HTML part. The HTML is tables and inline styles, because
// that's what Gmail and Outlook render; the <style> block only adds dark mode and
// small-screen tweaks for the clients that read it.

export type Mail = { subject: string; text: string; html: string };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Names are typed by people; keep them to one tidy line so they can't reshape the email.
function oneLine(s: string, max = 80): string {
  const t = s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// The email layout, on the site's one system: Console (app/tokens.css). The shop
// (shop.bzzy.ca) sends its email in the same layout; change both together.
//
// Colours are Console's tokens as hex, because email clients don't read oklch() or CSS
// variables: paper ground, a paper-2 card with a 1px rule and a 10px radius, ink heads
// at weight 500, and the amber accent on the one button.
export const MAIL_COLORS = {
  light: { paper: "#faf8f4", card: "#fffefb", rule: "#e0dbd7", ink: "#17130f", muted: "#5d5751", accent: "#f0b135", accentInk: "#201301", link: "#915200" },
  dark: { paper: "#0d1013", card: "#15191c", rule: "#2d3135", ink: "#eceff2", muted: "#9da2a8", accent: "#f7b83d", accentInk: "#1c0e00", link: "#f7b83d" },
};
const L = MAIL_COLORS.light;
const D = MAIL_COLORS.dark;

// The lockup (the four-dot mark and "bzzy" in Host Grotesk, as the site's nav sets it) is a
// PNG, because Gmail and Outlook don't show SVG. Rendered at 3x (240 x 84), shown at 80 x 28.
// bzzy-lockup-*.png are the old Geist lockups, kept because emails already sent point at them.
const LOGO_BASE = "https://bzzy.ca/email";

// Host Grotesk where the client loads web fonts (Apple Mail, iOS Mail); the system face elsewhere.
const FONT = "'Host Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Dark mode: Apple Mail, iOS Mail and some others honour prefers-color-scheme, so the
// colours flip and the logo swaps. Gmail and Outlook recolour by themselves instead,
// which these neutral colours survive. Narrow screens lose the outer padding so the
// card uses the whole width.
const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400;500&display=swap">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .logo-dark { display: none; }
  @media (prefers-color-scheme: dark) {
    .bg { background: ${D.paper} !important; }
    .card { background: ${D.card} !important; border-color: ${D.rule} !important; }
    .ink { color: ${D.ink} !important; }
    .ink a { color: ${D.link} !important; }
    .muted, .muted a { color: ${D.muted} !important; }
    .btn { background: ${D.accent} !important; color: ${D.accentInk} !important; }
    .quote { border-color: ${D.accent} !important; }
    .logo-light { display: none !important; }
    .logo-dark { display: block !important; }
  }
  @media (max-width: 520px) {
    .outer { padding: 16px 8px !important; }
    .card-pad { padding: 28px 22px !important; }
    .btn { display: block !important; text-align: center !important; }
  }
</style>`;

type Layout = {
  preheader: string; // the grey preview line in the inbox, already escaped
  title: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  quote?: string; // a block of someone's own words, shown as typed
  footer: string;
};

function layout({ preheader, title, paragraphs, button, quote, footer }: Layout): string {
  const p = (html: string) => `<p class="ink" style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${L.ink}">${html}</p>`;
  const url = button ? escapeHtml(button.url) : "";
  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>${title}</title></head>
<body class="bg" style="margin:0;padding:0;background:${L.paper};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${L.paper}">
<tr><td class="outer" align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 4px 20px">
<a href="https://bzzy.ca" style="text-decoration:none">
<img class="logo-light" src="${LOGO_BASE}/bzzy-console-light.png" width="80" height="28" alt="bzzy" style="display:block;border:0;width:80px;height:28px">
<!--[if !mso]><!--><img class="logo-dark" src="${LOGO_BASE}/bzzy-console-dark.png" width="80" height="28" alt="bzzy" style="display:none;border:0;width:80px;height:28px;mso-hide:all"><!--<![endif]-->
</a>
</td></tr>
<tr><td class="card card-pad" style="background:${L.card};border:1px solid ${L.rule};border-radius:10px;padding:36px 32px;font-family:${FONT}">
<h1 class="ink" style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:500;letter-spacing:-0.02em;color:${L.ink}">${title}</h1>
${paragraphs.map(p).join("\n")}
${quote ? `<div class="quote ink" style="margin:4px 0 16px;padding:4px 0 4px 14px;border-left:2px solid ${L.accent};font-size:16px;line-height:1.55;color:${L.ink};white-space:pre-wrap">${quote}</div>` : ""}
${
  button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px"><tr><td style="border-radius:6px;background:${L.accent}">
<a class="btn" href="${url}" style="display:inline-block;background:${L.accent};color:${L.accentInk};text-decoration:none;font-family:${FONT};font-weight:500;font-size:16px;line-height:20px;padding:12px 22px;border-radius:6px">${escapeHtml(button.label)}</a>
</td></tr></table>
<p class="muted" style="margin:0;font-size:13px;line-height:1.5;color:${L.muted}">Or paste this link into your browser:<br><a href="${url}" style="color:${L.muted};word-break:break-all">${url}</a></p>`
    : ""
}
</td></tr>
<tr><td class="muted" style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${L.muted}">
${footer}<br><a href="https://bzzy.ca" style="color:${L.muted}">bzzy.ca</a> &middot; a desk status light
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function inviteEmail(input: { teamName: string; inviterName: string; role: "member" | "admin"; url: string; expiresAt: Date }): Mail {
  const team = oneLine(input.teamName);
  const who = oneLine(input.inviterName || "Someone");
  const as = input.role === "admin" ? "an admin" : "a member";
  const ends = input.expiresAt.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const subject = `${who} invited you to ${team} on bzzy`;
  const intro = `${who} invited you to join ${team} on bzzy as ${as}. bzzy is a little status light for your desk that tells people when you're busy.`;
  const how = "You can sign up with a passkey, no password needed.";
  const footer = `This link is just for you and works until ${ends} (UTC). If you weren't expecting it, you can ignore this email.`;
  return {
    subject,
    text: `${intro}\n\n${how}\n\nJoin the team: ${input.url}\n\n${footer}\n`,
    html: layout({
      preheader: escapeHtml(`${who} invited you to join ${team}.`),
      title: `Join ${escapeHtml(team)}`,
      paragraphs: [escapeHtml(intro), escapeHtml(how)],
      button: { label: "Join the team", url: input.url },
      footer: escapeHtml(footer),
    }),
  };
}

// Lights set up for someone through the provisioning API (docs/provisioning.md). With a
// link: a new account that can't sign in yet. Without: an account they already use.
export function claimEmail(input: { name: string | null; lights: number; url: string; expiresAt: Date | null; shipped: boolean }): Mail {
  const hi = input.name ? `Hi ${oneLine(input.name, 40)},` : "Hi,";
  const it = input.lights === 1 ? "Your bzzy" : "Your bzzys";
  const subject = input.expiresAt ? `${it} ${input.shipped ? "is on its way" : "is ready"}: set up your account` : `${it} ${input.shipped ? "is on its way" : "is in your account"}`;
  const first = input.shipped
    ? `${it} ${input.lights === 1 ? "has" : "have"} shipped. When ${input.lights === 1 ? "it arrives, plug it in and it" : "they arrive, plug them in and they"}'ll ask for your Wi-Fi, then show your status.`
    : `${it} ${input.lights === 1 ? "is" : "are"} set up and waiting for you.`;
  const lines = input.expiresAt
    ? [
        hi,
        first,
        "We've made you a bzzy account to go with it. Open the link to sign in, then add a passkey or connect GitHub so you can get back in any time. There's no password.",
        "Once you're in you can add your calendar, pick your GIFs and change what the light shows.",
      ]
    : [hi, first, `${input.lights === 1 ? "It's" : "They're"} already in your bzzy account. Sign in as usual to add your calendar and change what it shows.`];
  const ends = input.expiresAt?.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const footer = input.expiresAt
    ? `This link signs you in once and works until ${ends} (UTC). Don't forward it. Need a new one? Ask whoever set up your light to send another.`
    : "You're getting this because a bzzy was set up for this email address.";
  const label = input.expiresAt ? "Set up my account" : "Open bzzy";
  return {
    subject,
    text: `${lines.join("\n\n")}\n\n${label}: ${input.url}\n\n${footer}\n`,
    html: layout({
      preheader: escapeHtml(first),
      title: escapeHtml(input.expiresAt ? "Set up your bzzy account" : subject),
      paragraphs: lines.map(escapeHtml),
      button: { label, url: input.url },
      footer: escapeHtml(footer),
    }),
  };
}

// To the person who just joined.
export function welcomeEmail(input: { teamName: string; name: string | null; role: "member" | "admin"; url: string }): Mail {
  const team = oneLine(input.teamName);
  const hi = input.name ? `Hi ${oneLine(input.name, 40)},` : "Hi,";
  const as = input.role === "admin" ? "an admin" : "a member";
  const lines = [
    `You're in: you joined ${team} on bzzy as ${as}.`,
    "Next, pair your light (or add your calendar) so your team can see when you're busy. You can sign in any time with your passkey.",
  ];
  const footer = "You're getting this because you joined a team on bzzy.";
  return {
    subject: `Welcome to ${team} on bzzy`,
    text: `${hi}\n\n${lines.join("\n\n")}\n\nOpen bzzy: ${input.url}\n\n${footer}\n`,
    html: layout({
      preheader: escapeHtml(`You're in ${team}. Next: pair your light.`),
      title: `Welcome to ${escapeHtml(team)}`,
      paragraphs: [escapeHtml(hi), ...lines.map(escapeHtml)],
      button: { label: "Open bzzy", url: input.url },
      footer: escapeHtml(footer),
    }),
  };
}

// To the team's owner and admins.
export function memberJoinedEmail(input: { teamName: string; who: string; role: "member" | "admin"; members: number; url: string }): Mail {
  const team = oneLine(input.teamName);
  const who = oneLine(input.who || "Someone");
  const as = input.role === "admin" ? "an admin" : "a member";
  const line = `${who} joined ${team} as ${as}. The team has ${input.members} ${input.members === 1 ? "person" : "people"} now.`;
  const footer = "You're getting this because you're an owner or admin of this team.";
  return {
    subject: `${who} joined ${team}`,
    text: `${line}\n\nSee the team: ${input.url}\n\n${footer}\n`,
    html: layout({
      preheader: escapeHtml(line),
      title: `${escapeHtml(who)} joined ${escapeHtml(team)}`,
      paragraphs: [escapeHtml(line)],
      button: { label: "See the team", url: input.url },
      footer: escapeHtml(footer),
    }),
  };
}

// A message from the contact form on the landing page, to hello@. Reply-To is the sender.
export function contactEmail(input: { name: string; email: string; message: string }): Mail {
  const name = oneLine(input.name, 80) || "Someone";
  const intro = `${name} <${input.email}> wrote through the contact form on bzzy.ca. Reply to this email to answer them.`;
  return {
    subject: `bzzy contact form: ${name}`,
    text: `${intro}\n\n---\n\n${input.message}\n`,
    html: layout({
      preheader: escapeHtml(oneLine(input.message, 120)),
      title: `Message from ${escapeHtml(name)}`,
      paragraphs: [`${escapeHtml(name)} &lt;<a href="mailto:${escapeHtml(input.email)}" style="color:inherit">${escapeHtml(input.email)}</a>&gt; wrote through the contact form on bzzy.ca. Reply to this email to answer them.`],
      quote: escapeHtml(input.message),
      footer: "Sent by the contact form on bzzy.ca.",
    }),
  };
}
