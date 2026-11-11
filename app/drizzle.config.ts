import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env files itself; load them the same way Next.js does
// (.env.local, .env.development, .env).
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL ?? "";
if (!url) {
  // `db:generate` works without a database; `db:migrate` needs one.
  console.warn("DATABASE_URL is not set. Put it in app/.env.local (or run `vercel env pull .env.local`).");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
