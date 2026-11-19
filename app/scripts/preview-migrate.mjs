// Runs before `next build`. On a Vercel preview deploy it applies the Drizzle migrations
// to that preview's own Neon branch, so a PR with a migration can be tried (and signed in
// to) without anyone needing the branch's connection string. Production and local builds
// do nothing here: production is still migrated by hand, before the PR merges.
import { execFileSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "preview") process.exit(0);
if (process.env.SKIP_PREVIEW_MIGRATE === "1") {
  console.log("preview-migrate: SKIP_PREVIEW_MIGRATE=1, not migrating.");
  process.exit(0);
}

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("preview-migrate: DATABASE_URL isn't set for this preview, so it can't be migrated.");
  process.exit(1);
}

// Say which database it's about to change (host only, never the password), so the build
// log shows it was the preview branch.
let host = "?";
try {
  host = new URL(raw).host;
} catch {}
console.log(`preview-migrate: applying migrations to ${host} (branch ${process.env.VERCEL_GIT_COMMIT_REF ?? "?"})`);

// A failed migration fails the build: a preview that can't sign anyone in is worse than none.
execFileSync("npx", ["--no-install", "drizzle-kit", "migrate"], { stdio: "inherit" });
console.log("preview-migrate: done.");
