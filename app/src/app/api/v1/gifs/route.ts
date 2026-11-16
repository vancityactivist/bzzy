import { apiOptions, apiRoute } from "@/lib/api-http";
import { BUILTIN_GIFS, gifsForUser } from "@/lib/gifs";

// GIFs a token can put up with PUT /v1/show: the built-ins and the uploads of every team
// the person is in. Unlike the other reads this one asks the database: it's for a picker,
// not for polling.

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ token }) => {
  console.info(`[db] api: gif list for ${token.userId}`);
  const uploads = await gifsForUser(token.userId);
  return {
    data: {
      gifs: [
        ...uploads.map((a) => ({ id: `asset:${a.id}`, name: a.name, kind: "upload" as const, status: null, addedAt: a.createdAt.toISOString() })),
        ...BUILTIN_GIFS.map((g) => ({ id: `builtin:${g.id}`, name: g.name, kind: "builtin" as const, status: g.status, addedAt: null })),
      ],
    },
  };
});

export const OPTIONS = apiOptions;
