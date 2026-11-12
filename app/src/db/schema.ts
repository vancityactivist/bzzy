// Database schema.
//
// Auth tables follow the shape @auth/drizzle-adapter expects. Everything else is
// built around teams from day one: every user gets a personal team on sign-up,
// and devices, calendars and GIFs belong to a team. A team of one is the
// personal case; inviting coworkers later is just more rows in team_members.
//
// Status ("presence") belongs to a person, not a device, so someone with a
// desk light and a door light sets their status once.

import {
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
import type { CachedEvent } from "../lib/ics";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Auth.js
// ---------------------------------------------------------------------------

// Site-wide role, separate from team roles. "admin" can open /admin.
export const userRole = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("user", {
  id: id(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  timezone: text("timezone").notNull().default("America/Vancouver"),
  role: userRole("role").notNull().default("user"),
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
    createdAt: timestamp("createdAt", { mode: "date" }).$defaultFn(() => new Date()),
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
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_member_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const statusKind = pgEnum("status_kind", ["free", "busy", "dnd", "away"]);

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
    // Short public id the person types into the device's setup page.
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // Whose status the light shows.
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // SHA-256 of the device token. The token itself is shown once and never stored.
    tokenHash: text("token_hash").notNull(),
    defaultStatus: statusKind("default_status").notNull().default("free"),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
    // Firmware updates (docs/ota.md). The device reports the rest on each poll.
    autoUpdate: boolean("auto_update").notNull().default(true),
    firmwareVersion: text("firmware_version"), // "0.2.0", or "dev" for a build flashed over USB
    board: text("board"), // the PlatformIO env it was built for
    firmwareFailed: text("firmware_failed"), // a version that installed but rolled back
    // Unix seconds of the last "Update now" press; 0 = none waiting.
    updateRequestedAt: integer("update_requested_at").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("device_team_idx").on(t.teamId), index("device_owner_idx").on(t.ownerUserId)],
);

// ---------------------------------------------------------------------------
// Calendars and GIFs (filled in by later steps)
// ---------------------------------------------------------------------------

export const calendars = pgTable(
  "calendar",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The secret ICS URL. Treat like a password: never send it to the browser after saving.
    icsUrl: text("ics_url").notNull(),
    // Show meeting titles on the device instead of "In a meeting".
    showTitles: boolean("show_titles").notNull().default(false),
    // The next week of events from the last good fetch, already expanded.
    events: jsonb("events").$type<CachedEvent[]>().notNull().default([]),
    lastFetchedAt: timestamp("last_fetched_at", { mode: "date" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("calendar_user_idx").on(t.userId)],
);

export const assets = pgTable(
  "asset",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
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
    assetId: text("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    builtin: text("builtin"),
  },
  (t) => [uniqueIndex("device_asset_unique").on(t.deviceId, t.status)],
);

// "Show now": a GIF and/or message a person puts on their lights' screens, on top of
// whatever their status is. One row per user, like presence. An upload that's
// deleted leaves the row with no GIF.
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
  // Unix seconds, matching the device protocol. 0 = until cleared.
  until: integer("until").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

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
