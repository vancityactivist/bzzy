# Search engines

bzzy.ca is the only address search engines should list. Only the signed-out landing page (`/`) is public.

## What the app does

- `app/src/app/robots.ts` serves `/robots.txt`: everything allowed except `/api/`, and a link to the sitemap.
- `app/src/app/sitemap.ts` serves `/sitemap.xml` with the one public page, `https://bzzy.ca/`. Add new public pages here.
- `app/src/app/page.tsx` sets the canonical URL `https://bzzy.ca/` and the JSON-LD (WebSite and Organization, logo `public/logo.png`).
- `app/src/app/(app)/layout.tsx` marks the whole signed-in app (and `/sign-in`, invites, admin) `noindex, follow`. These pages are left crawlable on purpose so search engines can read that tag.
- `app/next.config.ts` sends `X-Robots-Tag: noindex, nofollow` for everything still answered on `bzzy.vercel.app` (device API and built-in GIFs; the rest redirects to bzzy.ca) and for `/api/*` on every host.
- Share cards: `opengraph-image.jpg` and `twitter-image.jpg` (1200x630) beside the root layout, with `.alt.txt` files. Remake them if the hero or headline changes.
- getbzzy.ca, getbzzy.online and www redirect to bzzy.ca in Vercel, so they are never indexed on their own.

## Search Console and Bing

Verified with a DNS TXT record on bzzy.ca in Cloudflare (a Google "Domain" property, covering every subdomain), then imported into Bing Webmaster Tools from Search Console. Don't delete the `google-site-verification` TXT record: Google rechecks it and drops the property if it's gone.

Sitemap submitted in both: `https://bzzy.ca/sitemap.xml`.
