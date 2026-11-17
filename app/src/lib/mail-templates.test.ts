import { describe, expect, it } from "vitest";

import { contactEmail, escapeHtml, inviteEmail, memberJoinedEmail, welcomeEmail } from "./mail-templates";

const base = {
  teamName: "Front office",
  inviterName: "Adam",
  role: "member" as const,
  url: "https://bzzy.ca/join/abc123abc123abc123",
  expiresAt: new Date("2026-11-24T12:00:00Z"),
};

describe("inviteEmail", () => {
  it("names the team, inviter, role and link", () => {
    const m = inviteEmail(base);
    expect(m.subject).toBe("Adam invited you to Front office on bzzy");
    expect(m.text).toContain("as a member");
    expect(m.text).toContain(base.url);
    expect(m.text).toContain("November 24, 2026");
    expect(m.html).toContain(`href="${base.url}"`);
  });

  it("says admin for admin invites", () => {
    expect(inviteEmail({ ...base, role: "admin" }).text).toContain("as an admin");
  });

  it("escapes names in the HTML and keeps them on one line", () => {
    const m = inviteEmail({ ...base, teamName: '<b>Ops</b>\n\nClick "here"', inviterName: "" });
    expect(m.html).not.toContain("<b>Ops</b>");
    expect(m.html).toContain("&lt;b&gt;Ops&lt;/b&gt;");
    expect(m.subject).toBe('Someone invited you to <b>Ops</b> Click "here" on bzzy');
    expect(m.subject).not.toMatch(/\n/);
  });

  it("trims very long names", () => {
    expect(inviteEmail({ ...base, teamName: "x".repeat(200) }).subject.length).toBeLessThan(120);
  });
});

describe("escapeHtml", () => {
  it("escapes the five characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("contactEmail", () => {
  it("keeps the message as typed but escaped", () => {
    const m = contactEmail({ name: "Sam\nBcc: x@y.z", email: "sam@example.com", message: "Hi <there>\nline two" });
    expect(m.subject).toBe("bzzy contact form: Sam Bcc: x@y.z");
    expect(m.text).toContain("Hi <there>\nline two");
    expect(m.html).toContain("Hi &lt;there&gt;");
    expect(m.html).not.toContain("<there>");
  });
});

describe("join emails", () => {
  it("welcomes the new member", () => {
    const m = welcomeEmail({ teamName: "Front office", name: "Sam", role: "member", url: "https://bzzy.ca" });
    expect(m.subject).toBe("Welcome to Front office on bzzy");
    expect(m.text).toContain("Hi Sam,");
  });

  it("tells admins who joined", () => {
    const m = memberJoinedEmail({ teamName: "Front office", who: "Sam", role: "admin", members: 4, url: "https://bzzy.ca/teams/t" });
    expect(m.subject).toBe("Sam joined Front office");
    expect(m.text).toContain("as an admin. The team has 4 people now.");
  });
});
