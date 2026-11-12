// Who can do what in a team, and whether an invite link still works. Pure, so it's
// unit-tested; lib/teams.ts does the database side.
//
// Two layers: the site-wide superadmin (user.role = "admin"), who can act in any team
// without joining it, and a role inside each team.

export type TeamRole = "owner" | "admin" | "member";

export type TeamAccess = {
  // Null when they aren't a member (a superadmin looking in, or nobody).
  role: TeamRole | null;
  superadmin: boolean;
};

export type TeamAction =
  | "view" // the team page: members, roles
  | "manage" // invite links, remove members, the audit log (and later: dashboard, pushes)
  | "setRoles" // promote to admin, demote
  | "owner"; // rename, delete, transfer ownership

const RANK: Record<TeamRole, number> = { member: 0, admin: 1, owner: 2 };

export function can(access: TeamAccess, action: TeamAction): boolean {
  if (access.superadmin) return true;
  const r = access.role;
  if (!r) return false;
  switch (action) {
    case "view":
      return true;
    case "manage":
      return RANK[r] >= RANK.admin;
    case "setRoles":
    case "owner":
      return r === "owner";
  }
}

// Removing someone else. Admins can remove members but not other admins; the owner
// can remove anyone but themself (they transfer or delete instead).
export function canRemove(access: TeamAccess, target: TeamRole, self: boolean): boolean {
  if (target === "owner") return false;
  if (self) return access.role !== null; // leaving
  if (access.superadmin || access.role === "owner") return true;
  return access.role === "admin" && target === "member";
}

// Only these two can be given out or changed; ownership moves by transfer.
export const ASSIGNABLE_ROLES = ["member", "admin"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const INVITE_DAYS = [1, 7, 30] as const;
export const DEFAULT_INVITE_DAYS = 7;

export type InviteRow = {
  kind: "team" | "single";
  maxUses: number | null;
  uses: number;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type InviteState = "live" | "expired" | "revoked" | "used";

export function inviteState(inv: InviteRow, now: Date): InviteState {
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt.getTime() <= now.getTime()) return "expired";
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return "used";
  return "live";
}

// Admin invites have to be single-use: a reusable admin link in a chat is too easy to leak.
export function inviteAllowed(kind: InviteRow["kind"], role: AssignableRole): boolean {
  return role === "member" || kind === "single";
}

export function cleanTeamName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 60);
  return name.length >= 2 ? name : null;
}
