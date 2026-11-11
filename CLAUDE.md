# bzzy

## app/package-lock.json

Install dependencies with `npm ci`, not `npm install`. `npm ci` installs exactly what the lockfile says and never rewrites it.

Running `npm install` on Windows rewrites the lockfile and drops optional packages for other platforms (`@emnapi/*`). The result looks like harmless churn, but it's broken: `npm ci`, and therefore the Vercel build, rejects it. Never commit a lockfile that changed only because of that.

Only change the lockfile when you add, remove or upgrade a dependency, and do it on Linux or macOS (the cloud sessions are fine).
