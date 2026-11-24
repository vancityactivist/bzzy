// Database schema.
//
// Auth tables follow the shape @auth/drizzle-adapter expects. Everything else is
// built around teams from day one: every user gets a personal team on sign-up,
// and devices, calendars and GIFs belong to a team. A team of one is the
// personal case; inviting coworkers later is just more rows in team_members.
//
// Status ("presence") belongs to a person, not a device, so someone with a
// desk light and a door light sets their status once. So does the look: which GIF and
// ring style each status gets. A light that doesn't follow its owner (a boardroom, a
// shared door) has a status and Show now of its own (light_status, light_show).

import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

import type { ReleaseManifest } from "../lib/firmware";
import type { LedStyle } from "../lib/push-rules";
import type { LedStyles, MeetingWarn } from "../lib/ring";
import type { ShowColors } from "../lib/show-colors";
import type { StatusLabels } from "../lib/status-labels";
import type { CachedEvent } from "../lib/ics";
import type { Delivery } from "../lib/webhook-rules";
import type { HoursMode, WorkHours } from "../lib/work-hours";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Auth.js
// ---------------------------------------------------------------------------

// Site-wide role, separate from team roles. "admin" can open /admin.
export const userRole = pgEnum("user_role", ["user", "admin"]);

export const statusKind = pgEnum("status_kind", [
  "free",
  "busy",
  "dnd",
  "away",
]);

export const users = pgTable("user", {
  id: id(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  timezone: text("timezone").notNull().default("America/Vancouver"),
  // Working hours (lib/work-hours.ts); null = always on.
  workHours: jsonb("work_hours").$type<WorkHours>(),
  // The look of every light that follows this person (lib/look.ts): what they show
  // between meetings, how the ring moves for each status, and the meeting warning.
  defaultStatus: statusKind("default_status").notNull().default("free"),
  ledStyles: jsonb("led_styles").$type<LedStyles>(),
  meetingWarn: jsonb("meeting_warn").$type<MeetingWarn>(),
  // What they call their statuses (lib/status-labels.ts); only the renamed ones. null: none.
  statusLabels: jsonb("status_labels").$type<StatusLabels>(),
  role: userRole("role").notNull().default("user"),
  // A superadmin turned off this person's API tokens (all revoked, no new ones).
  apiBlocked: boolean("api_blocked").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// Passkeys (WebAuthn credentials).
export const authenticators = pgTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: boolean("credentialBackedUp").notNull(),
    transports: text("transports"),
    // Ours, not Auth.js's: shown on Settings so people can tell passkeys apart.
    // Null on passkeys added before these columns existed.
    name: text("name"),
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(
      () => new Date(),
    ),
    lastUsedAt: timestamp("lastUsedAt", { mode: "date" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.credentialID] })],
);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export const teamRole = pgEnum("team_role", ["owner", "admin", "member"]);

export const teams = pgTable("team", {
  id: id(),
  name: text("name").notNull(),
  // A personal team is created automatically and can't have other members.
  personal: boolean("personal").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  "team_member",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index("team_member_user_idx").on(t.userId),
  ],
);

// "team": a reusable link for the office chat. "single": one person.
export const inviteKind = pgEnum("invite_kind", ["team", "single"]);

// Invite links (/join/<token>). Only the token's SHA-256 is stored, like device
// tokens, so a link is shown once; a lost one is replaced and the old one revoked.
export const teamInvites = pgTable(
  "team_invite",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    kind: inviteKind("kind").notNull(),
    role: teamRole("role").notNull().default("member"),
    // Who a one-person link was emailed to (docs/email.md). Shown to admins, not enforced.
    email: text("email"),
    // Null = unlimited (team links). 1 for single-use links.
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("team_invite_team_idx").on(t.teamId)],
);

// What happened in a team and who did it: joins, removals, role changes, invites,
// and anything a superadmin does there. Team admins can read it.
export const teamAudit = pgTable(
  "team_audit",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // True when the actor was acting as superadmin rather than as a member.
    asSuperadmin: boolean("as_superadmin").notNull().default(false),
    at: timestamp("at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("team_audit_team_idx").on(t.teamId, t.at)],
);

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

// A person's manual override. One row per user; `active = false` keeps the
// time it was cleared so older button presses can't bring it back.
export const presence = pgTable("presence", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(false),
  status: statusKind("status").notNull().default("free"),
  text: text("text").notNull().default(""),
  // Unix seconds, matching the device protocol. 0 = until cleared.
  until: integer("until").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
  // Where the last change came from: "web" or a device id.
  source: text("source").notNull().default("web"),
});

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export const devices = pgTable(
  "device",
  {
    // Short public id. Paired lights get it from the app; hand-set ones have it typed in.
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // Whose status the light shows (unless followsOwner is off).
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // SHA-256 of the device token. The token itself is shown once and never stored.
    tokenHash: text("token_hash").notNull(),
    // Off: the light has its own status and Show now (light_status, light_show), and a
    // press on it changes only it. On: it shows its owner's.
    followsOwner: boolean("follows_owner").notNull().default(true),
    // What a light that doesn't follow its owner shows when nothing is set. Lights that
    // follow use the owner's (user.default_status).
    defaultStatus: statusKind("default_status").notNull().default("free"),
    // Its own names for the statuses, for a light that doesn't follow its owner (lights
    // that follow use user.status_labels). null: the standard words.
    statusLabels: jsonb("status_labels").$type<StatusLabels>(),
    // The one team whose pushes this light shows. Null = none. Never a personal team.
    pushTeamId: text("push_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    // X-Bzzy-Features from the last poll ("leds,push"). Null = firmware from before it.
    features: text("features"),
    // Working hours (lib/work-hours.ts lightWorkHours): "owner" uses its owner's
    // (user.work_hours), "own" uses workHours below, "always" is never dark.
    hoursMode: text("hours_mode").$type<HoursMode>().notNull().default("owner"),
    // Its own hours, for hoursMode "own". Kept when the mode changes, so switching back
    // brings them back.
    workHours: jsonb("work_hours").$type<WorkHours>(),
    // allowFlash off: the ring is always steady, pushes too.
    allowFlash: boolean("allow_flash").notNull().default(true),
    // No longer read: the ring styles moved to the owner (user.led_styles). Kept until a
    // later migration drops them, so rolling back is safe.
    ledStyles: jsonb("led_styles").$type<LedStyles>(),
    meetingWarn: jsonb("meeting_warn").$type<MeetingWarn>(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
    // Firmware updates (docs/ota.md). The device reports the rest on each poll.
    autoUpdate: boolean("auto_update").notNull().default(true),
    firmwareVersion: text("firmware_version"), // "0.2.0", or "dev" for a build flashed over USB
    board: text("board"), // the PlatformIO env it was built for
    firmwareFailed: text("firmware_failed"), // a version that installed but rolled back
    // Unix seconds of the last "Update now" press; 0 = none waiting.
    updateRequestedAt: integer("update_requested_at").notNull().default(0),
    // Set up for someone else (docs/provisioning.md): the claim it was paired to, and
    // ship mode. While shipMode is on the poll answer says `ship: true`; the light forgets
    // its Wi-Fi and waits to be set up at its new home, then says it has arrived.
    claimId: text("claim_id").references((): AnyPgColumn => lightClaims.id, {
      onDelete: "set null",
    }),
    shipMode: boolean("ship_mode").notNull().default(false),
    shippedAt: timestamp("shipped_at", { mode: "date" }),
    arrivedAt: timestamp("arrived_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("device_team_idx").on(t.teamId),
    index("device_owner_idx").on(t.ownerUserId),
    index("device_claim_idx").on(t.claimId),
  ],
);

// Lights set up for someone by email through the provisioning API (docs/provisioning.md),
// for example by a shop. `ref` is the caller's own id for it (an order number), so
// creating the same claim twice gives the same row. The person gets a one-time link
// (/claim/<token>) to sign in and set up a passkey or GitHub; only its SHA-256 is stored.
export const lightClaims = pgTable(
  "light_claim",
  {
    id: id(),
    ref: text("ref").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    tokenHash: text("token_hash"),
    tokenExpiresAt: timestamp("token_expires_at", { mode: "date" }),
    // When the person first got in: by the link, or straight away for an account that
    // could already sign in.
    claimedAt: timestamp("claimed_at", { mode: "date" }),
    invitedAt: timestamp("invited_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("light_claim_user_idx").on(t.userId)],
);

// A light that hasn't been added yet asks for a pairing code (POST /api/pair) and
// shows it as a QR code. Someone signed in opens /pair/<code> and claims it; the
// device, which holds `secret`, then picks up its id. The secret becomes the device
// token, so the token never appears in a QR code or on screen. See docs/protocol.md.
export const devicePairings = pgTable(
  "device_pairing",
  {
    id: id(),
    // Short code from the device's screen (upper case, no 0/O/1/I/L).
    code: text("code").notNull().unique(),
    // SHA-256 of the secret only the device has. Copied to device.token_hash on claim.
    secretHash: text("secret_hash").notNull(),
    // SHA-256 of the requester's IP, to limit how many codes one network can hold.
    ipHash: text("ip_hash").notNull(),
    board: text("board"),
    firmwareVersion: text("firmware_version"),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    // Set when someone claims it.
    deviceId: text("device_id").references(() => devices.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("device_pairing_ip_idx").on(t.ipHash),
    index("device_pairing_expires_idx").on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Calendars and GIFs (filled in by later steps)
// ---------------------------------------------------------------------------

// A connection to a calendar provider: a Google account, or a CalDAV login (iCloud and
// others). One person can have several. ICS links don't have one.
export type CalendarProvider = "google" | "caldav";
export type CalendarAccountState = "ok" | "needs_reconnect" | "error";

export const calendarAccounts = pgTable(
  "calendar_account",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<CalendarProvider>().notNull(),
    // What the person sees: the Google address or Apple ID.
    label: text("label").notNull(),
    // The provider's id for the account (Google `sub`), so reconnecting updates the row.
    externalId: text("external_id"),
    // CalDAV only: the server and login name.
    serverUrl: text("server_url"),
    username: text("username"),
    // The Google refresh token or CalDAV password, encrypted in the app (AES-256-GCM)
    // before it gets here, and the id of the key that did it. Never sent to the browser.
    secret: text("secret").notNull(),
    keyId: text("key_id").notNull(),
    scopes: text("scopes"),
    state: text("state").$type<CalendarAccountState>().notNull().default("ok"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("calendar_account_user_idx").on(t.userId),
    uniqueIndex("calendar_account_provider_ext_idx").on(
      t.userId,
      t.provider,
      t.externalId,
    ),
  ],
);

export type CalendarSource = "ics" | "google" | "caldav";
export type CalendarCountsAs = "auto" | "busy" | "dnd" | "away";

export const calendars = pgTable(
  "calendar",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Where the events come from. ICS rows have `icsUrl`; the others an account and the
    // provider's id for the calendar.
    source: text("source").$type<CalendarSource>().notNull().default("ics"),
    accountId: text("account_id").references(() => calendarAccounts.id, {
      onDelete: "cascade",
    }),
    externalId: text("external_id"),
    // The secret ICS URL. Treat like a password: never send it to the browser after saving.
    icsUrl: text("ics_url"),
    // Off: the calendar is listed but doesn't change your status.
    setsStatus: boolean("sets_status").notNull().default(true),
    // How this calendar's events count: "auto" uses each event's own free/busy and type;
    // the others make every event that status (a Focus calendar = do not disturb).
    countsAs: text("counts_as").$type<CalendarCountsAs>().notNull().default("auto"),
    // Priority order (lower first). Where events of the same strength overlap, the
    // higher calendar decides whose title shows.
    position: integer("position").notNull().default(0),
    // The provider's colour for the calendar (#rrggbb), when it has one.
    color: text("color"),
    // Which lights use it. null: every light that follows you. A list: only those lights,
    // which can include lights with their own status.
    lightIds: jsonb("light_ids").$type<string[]>(),
    // Incremental-sync bookmarks (Google sync token, CalDAV ctag, push channel).
    syncState: jsonb("sync_state").$type<Record<string, unknown>>(),
    // Show meeting titles on the device instead of "In a meeting".
    showTitles: boolean("show_titles").notNull().default(false),
    // The next week of events from the last good fetch, already expanded.
    events: jsonb("events").$type<CachedEvent[]>().notNull().default([]),
    lastFetchedAt: timestamp("last_fetched_at", { mode: "date" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("calendar_user_idx").on(t.userId),
    index("calendar_account_idx").on(t.accountId),
  ],
);

export const assets = pgTable(
  "asset",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    blobUrl: text("blob_url").notNull(),
    bytes: integer("bytes").notNull(),
    // First 16 hex chars of the processed file's SHA-256. Devices compare it to
    // decide whether to download again.
    sha: text("sha").notNull().default(""),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("asset_team_idx").on(t.teamId)],
);

// No longer read: the GIF for each status moved to the owner (user_gif). Kept until a
// later migration drops it, so rolling back is safe.
// Which GIF a device plays for each status. No row: the built-in default for that
// status. A row with an upload or a built-in id: that GIF. A row with neither: no GIF
// (the plain colour card).
export const deviceAssets = pgTable(
  "device_asset",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    status: statusKind("status").notNull(),
    assetId: text("asset_id").references(() => assets.id, {
      onDelete: "cascade",
    }),
    builtin: text("builtin"),
  },
  (t) => [uniqueIndex("device_asset_unique").on(t.deviceId, t.status)],
);

// Which GIF each status shows on every light that follows this person. No row: the
// built-in default for that status. A row with an upload or a built-in id: that GIF. A
// row with neither: no GIF (the plain colour card).
export const userGifs = pgTable(
  "user_gif",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: statusKind("status").notNull(),
    assetId: text("asset_id").references(() => assets.id, {
      onDelete: "cascade",
    }),
    builtin: text("builtin"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.status] })],
);

// The status of a light that doesn't follow its owner, set from the app or its own
// button. Same shape and rules as presence.
export const lightStatus = pgTable("light_status", {
  deviceId: text("device_id")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(false),
  status: statusKind("status").notNull().default("free"),
  text: text("text").notNull().default(""),
  until: integer("until").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
  // "web", "api" or the light's own id.
  source: text("source").notNull().default("web"),
});

// "Show now" on a light that doesn't follow its owner. Same shape as show_now.
export const lightShow = pgTable("light_show", {
  deviceId: text("device_id")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(false),
  assetId: text("asset_id").references(() => assets.id, {
    onDelete: "set null",
  }),
  builtin: text("builtin"),
  text: text("text").notNull().default(""),
  leds: jsonb("leds").$type<LedStyle>(),
  colors: jsonb("colors").$type<ShowColors>(),
  until: integer("until").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

// "Show now": a GIF and/or message a person puts on their lights' screens, on top of
// whatever their status is. One row per user, like presence. An upload that's
// deleted leaves the row with no GIF.
// A person's own marks on a GIF in their library: a favourite, and when they last put
// it on their light. `choice` is the same "builtin:<id>" / "asset:<id>" the pickers
// use, so built-in GIFs can be favourites too. A row for a deleted upload is harmless
// (the library ignores choices it can't show) and goes when the person does.
export const gifPrefs = pgTable(
  "gif_pref",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    choice: text("choice").notNull(),
    favourite: boolean("favourite").notNull().default(false),
    // Unix seconds; 0 = never shown from the app.
    lastShownAt: integer("last_shown_at").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.choice] })],
);

export const showNow = pgTable("show_now", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(false),
  assetId: text("asset_id").references(() => assets.id, {
    onDelete: "set null",
  }),
  builtin: text("builtin"),
  text: text("text").notNull().default(""),
  // How the ring moves while it's up (docs/protocol.md, "LED styles"). null: the
  // status's own style.
  leds: jsonb("leds").$type<LedStyle>(),
  // The screen's background and text colours (lib/show-colors.ts). null: white on black.
  colors: jsonb("colors").$type<ShowColors>(),
  // Unix seconds, matching the device protocol. 0 = until cleared.
  until: integer("until").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Team pushes
// ---------------------------------------------------------------------------

export const pushTarget = pgEnum("push_target", ["all", "users"]);

// A team-level "show now" an admin sends to everyone or to picked people: a message
// and/or GIF, plus an optional flash. It beats the person's own show now until it
// ends, is ended early, or they dismiss it with the light's top button.
export const teamPushes = pgTable(
  "team_push",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    target: pushTarget("target").notNull().default("all"),
    text: text("text").notNull().default(""),
    assetId: text("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    builtin: text("builtin"),
    leds: jsonb("leds").$type<LedStyle>(),
    // Unix seconds, like the device protocol. until 0 = until ended.
    until: integer("until").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
    endedAt: integer("ended_at"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("team_push_team_idx").on(t.teamId, t.updatedAt)],
);

// Who a "users" push is for.
export const teamPushTargets = pgTable(
  "team_push_target",
  {
    pushId: text("push_id")
      .notNull()
      .references(() => teamPushes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.pushId, t.userId] })],
);

// A person dismissed a push with their light's button. Counts for all their lights.
export const teamPushAcks = pgTable(
  "team_push_ack",
  {
    pushId: text("push_id")
      .notNull()
      .references(() => teamPushes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    at: integer("at").notNull(),
    deviceId: text("device_id"),
  },
  (t) => [primaryKey({ columns: [t.pushId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Public API (docs/api.md)
// ---------------------------------------------------------------------------

// Personal access tokens for /api/v1. Like device tokens, only the SHA-256 is stored and
// the token is shown once. `prefix` is its first characters, so people can tell tokens
// apart in Settings. Revoked rows are kept, so a lost token's "last used" stays visible.
export const apiTokens = pgTable(
  "api_token",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    // Sorted, comma-separated ("read,show,status"); see lib/api-rules.ts SCOPES.
    scopes: text("scopes").notNull(),
    // Null = never.
    expiresAt: timestamp("expires_at", { mode: "date" }),
    // Written rarely (lib/api-tokens.ts); the cache holds a newer one between writes.
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("api_token_user_idx").on(t.userId)],
);

// Where a person's events are sent (lib/webhooks.ts, docs/api.md).
export const webhooks = pgTable(
  "webhook",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    // Sorted, comma-separated ("button.pressed,status.changed"); see lib/webhook-rules.ts.
    events: text("events").notNull(),
    // The whsec_ signing secret, encrypted (lib/seal.ts). Shown once, when it's made.
    secret: text("secret").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // Failed deliveries in a row; at 20 it turns itself off.
    failures: integer("failures").notNull().default(0),
    // The last 20 deliveries, newest first (lib/webhook-rules.ts Delivery).
    recent: jsonb("recent").$type<Delivery[]>().notNull().default([]),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("webhook_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Firmware releases
// ---------------------------------------------------------------------------

// The latest firmware release on GitHub, re-read when a device or page needs it and
// the copy is older than a few minutes. One row, id "latest". A failed check keeps
// the last good release and records the error.
export const firmwareRelease = pgTable("firmware_release", {
  id: text("id").primaryKey(),
  // Null until a release has been read successfully.
  tag: text("tag"),
  version: text("version"),
  // The release's manifest.json, plus where each file can be downloaded from.
  manifest: jsonb("manifest").$type<ReleaseManifest>(),
  assets: jsonb("assets").$type<Record<string, string>>().notNull().default({}),
  checkedAt: timestamp("checked_at", { mode: "date" }).notNull(),
  lastError: text("last_error"),
});
