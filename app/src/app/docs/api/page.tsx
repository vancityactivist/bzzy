import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BzzyMark } from "@/components/brand";
import { cx } from "@/components/ui";
import { API_EXAMPLES } from "@/lib/api-examples";
import { openApiDocument } from "@/lib/api-openapi";
import { LIMITS, MAX_LIVE_TOKENS, SCOPE_INFO, SCOPES } from "@/lib/api-rules";
import { REPO_URL, SITE_URL } from "@/lib/site";

import { CopyButton } from "../../(app)/devices/copy-button";

// The public API's docs (docs/api.md is the same story for people reading the repo). Public
// and indexable, unlike the app's pages. The reference is built from the OpenAPI document the
// API serves, so the two can't drift; examples come from lib/api-examples.ts.

const BASE = `${SITE_URL}/api/v1`;
const OPENAPI = `${BASE}/openapi.json`;

export const metadata: Metadata = {
  title: "API docs",
  description: "Set your bzzy status and Show now from scripts, Stream Deck, Home Assistant or Power Automate with a personal token.",
  alternates: { canonical: "/docs/api" },
  openGraph: { url: "/docs/api", title: "bzzy API docs" },
};

const TOC = [
  { id: "start", label: "Quick start" },
  { id: "tokens", label: "Tokens and scopes" },
  { id: "reference", label: "Endpoints" },
  { id: "recipes", label: "Recipes" },
  { id: "errors", label: "Errors" },
  { id: "limits", label: "Rate limits" },
  { id: "versioning", label: "Versioning" },
  { id: "terms", label: "Terms" },
  { id: "changelog", label: "Changelog" },
];

export default function ApiDocsPage() {
  const doc = openApiDocument(SITE_URL);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-background/75 backdrop-blur-lg backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <BzzyMark className="size-6 shrink-0" />
            bzzy
          </Link>
          <span className="text-line-strong" aria-hidden>
            /
          </span>
          <span className="text-sm font-medium">API docs</span>
          <nav className="ml-auto flex items-center gap-1 text-sm font-medium" aria-label="Site">
            <a href={REPO_URL} className="hidden h-8 items-center rounded-full px-3 text-muted hover:text-foreground sm:flex">
              GitHub
            </a>
            <Link href="/settings" className="flex h-8 items-center rounded-full bg-foreground px-3 text-background">
              Get a token
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:py-14">
        <aside className="hidden w-44 shrink-0 lg:block">
          <nav aria-label="On this page" className="sticky top-24 text-sm">
            <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">On this page</p>
            <ul className="space-y-1.5">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-muted hover:text-foreground">
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1 space-y-16">
          <section className="space-y-4">
            <p className="text-sm font-medium text-muted">Version 1</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">The bzzy API</h1>
            <p className="max-w-2xl text-lg text-muted text-pretty">
              Set your status and Show now from anything that can make a web request: a script, a Stream Deck button, Home Assistant, Power Automate,
              or your own app. Read what your lights are showing, too.
            </p>
            <dl className="grid max-w-2xl gap-3 text-sm sm:grid-cols-2">
              <Fact label="Base URL" value={BASE} copy />
              <Fact label="OpenAPI" value={OPENAPI} href={OPENAPI} />
            </dl>
            <nav aria-label="On this page" className="lg:hidden">
              <ul className="flex flex-wrap gap-2 text-sm">
                {TOC.map((t) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="flex h-8 items-center rounded-full border border-line px-3 text-muted hover:text-foreground">
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </section>

          <Section id="start" title="Quick start">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Sign in and open{" "}
                <Link href="/settings" className="font-medium underline underline-offset-2">
                  Settings → API tokens
                </Link>
                .
              </li>
              <li>Name the token after what will use it, pick what it can do, and copy it. It&apos;s only shown once.</li>
              <li>Send it in the Authorization header. Here&apos;s Busy for 45 minutes:</li>
            </ol>
            <Code label="curl">{`curl -X PUT ${BASE}/status \\
  -H "Authorization: Bearer $BZZY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"busy","text":"On a call","minutes":45}'`}</Code>
            <Code label="PowerShell">{`$h = @{ Authorization = "Bearer $env:BZZY_TOKEN" }
Invoke-RestMethod -Method Put -Uri ${BASE}/status -Headers $h \`
  -ContentType application/json -Body '{"status":"busy","text":"On a call","minutes":45}'`}</Code>
            <Code label="JavaScript">{`await fetch("${BASE}/status", {
  method: "PUT",
  headers: { Authorization: \`Bearer \${process.env.BZZY_TOKEN}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ status: "busy", text: "On a call", minutes: 45 }),
});`}</Code>
            <Code label="Python">{`import os, requests

requests.put(
    "${BASE}/status",
    headers={"Authorization": f"Bearer {os.environ['BZZY_TOKEN']}"},
    json={"status": "busy", "text": "On a call", "minutes": 45},
)`}</Code>
            <p>
              Your lights pick it up on their next check-in, within about 20 seconds. To go back to your calendar, send{" "}
              <C>DELETE /status</C>.
            </p>
          </Section>

          <Section id="tokens" title="Tokens and scopes">
            <p>
              Tokens start with <C>bzzy_pat_</C> and belong to you: they act as you, on your own status and lights. Only a hash is stored, so a lost
              token can&apos;t be shown again. Revoke it in Settings and make a new one. You can have {MAX_LIVE_TOKENS} at once, each expiring after 30
              days, 90 days, a year, or never.
            </p>
            <Table
              head={["Scope", "Lets the token"]}
              rows={SCOPES.map((s) => [<C key="s">{s}</C>, SCOPE_INFO[s].detail])}
            />
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Give an integration only the scopes it needs. A button that sets Busy only needs status.</li>
              <li>
                Keep tokens out of URLs, screenshots and shared repos. The <C>bzzy_pat_</C> prefix makes a leaked one easy to search for.
              </li>
              <li>The API only reads the Authorization header. Being signed in to bzzy.ca in a browser doesn&apos;t let a page call it for you.</li>
            </ul>
          </Section>

          <Section id="reference" title="Endpoints">
            <p>
              JSON in and out. Times are ISO 8601 in UTC. A <C>PUT</C> or <C>DELETE</C> that wouldn&apos;t change anything saves nothing and answers{" "}
              <C>&quot;changed&quot;: false</C>, so it&apos;s fine to send the same state again.
            </p>
            <div className="space-y-10">
              {Object.entries(doc.paths).flatMap(([path, methods]) =>
                Object.entries(methods).map(([method, op]) => (
                  <Endpoint
                    key={`${method} ${path}`}
                    method={method.toUpperCase()}
                    path={path}
                    op={op as Operation}
                    schemas={doc.components.schemas as Record<string, JsonSchema>}
                  />
                )),
              )}
            </div>
          </Section>

          <Section id="recipes" title="Recipes">
            <h3 className="text-lg font-semibold">Home Assistant</h3>
            <p>
              Commands to set and clear your status, and a sensor that reads it. Put <C>bzzy_token: &quot;Bearer bzzy_pat_…&quot;</C> in{" "}
              <C>secrets.yaml</C>.
            </p>
            <Code label="configuration.yaml">{`rest_command:
  bzzy_busy:
    url: ${BASE}/status
    method: put
    headers:
      authorization: !secret bzzy_token
    content_type: application/json
    payload: '{"status":"busy","minutes":30}'
  bzzy_clear:
    url: ${BASE}/status
    method: delete
    headers:
      authorization: !secret bzzy_token

sensor:
  - platform: rest
    name: bzzy status
    resource: ${BASE}/status
    headers:
      authorization: !secret bzzy_token
    value_template: "{{ value_json.status }}"
    json_attributes: [source, text, until]
    scan_interval: 60`}</Code>

            <h3 className="pt-4 text-lg font-semibold">Stream Deck</h3>
            <p>
              Use any plugin from the Stream Deck store that sends web requests. Set the method to PUT, the URL to <C>{`${BASE}/status`}</C>, add the
              header <C>Authorization: Bearer bzzy_pat_…</C> and <C>Content-Type: application/json</C>, and use a body like{" "}
              <C>{`{"status":"dnd","minutes":25}`}</C>. Make one button per status, and one that sends DELETE to clear.
            </p>

            <h3 className="pt-4 text-lg font-semibold">Power Automate</h3>
            <p>
              In a cloud flow, add an <strong>HTTP</strong> action (a premium connector) with the method, URL, headers and body above. For example,
              trigger it from Outlook&apos;s &ldquo;When an upcoming event is starting soon&rdquo; to go Busy before a meeting. If your organisation
              blocks that connector, the calendar link in Settings already does this without it.
            </p>

            <h3 className="pt-4 text-lg font-semibold">A PowerShell script</h3>
            <p>Save this as a script and run it from a shortcut or Task Scheduler.</p>
            <Code label="bzzy.ps1">{`param([ValidateSet("free","busy","dnd","away","clear")] $Status = "busy", [int] $Minutes = 0, [string] $Text = "")
$h = @{ Authorization = "Bearer $env:BZZY_TOKEN" }
if ($Status -eq "clear") {
  Invoke-RestMethod -Method Delete -Uri ${BASE}/status -Headers $h
} else {
  $body = @{ status = $Status; text = $Text }
  if ($Minutes -gt 0) { $body.minutes = $Minutes }
  Invoke-RestMethod -Method Put -Uri ${BASE}/status -Headers $h -ContentType application/json -Body ($body | ConvertTo-Json)
}`}</Code>
          </Section>

          <Section id="errors" title="Errors">
            <p>Every error has the same shape. The message is written for a person, so it&apos;s fine to show it.</p>
            <Code label="JSON">{`{ "error": { "code": "missing_scope", "message": "This token can't do that. …", "field": null } }`}</Code>
            <Table
              head={["Status", "Code", "When"]}
              rows={[
                ["400", "invalid_json, invalid_request", "The body isn't JSON, or a field is wrong (field names it)"],
                ["401", "unauthorized", "No token, or it was revoked or has expired"],
                ["403", "missing_scope", "The token can't do this"],
                ["404", "unknown_gif", "No such GIF, or not one you can use"],
                ["415", "unsupported_media_type", "Send Content-Type: application/json"],
                ["429", "rate_limited", "Too many requests: wait Retry-After seconds"],
                ["500", "server_error", "Our fault. Quote the X-Request-Id header"],
              ].map(([a, b, c]) => [a, <C key="c">{b}</C>, c])}
            />
          </Section>

          <Section id="limits" title="Rate limits">
            <p>
              Each token gets {LIMITS.read} reads and {LIMITS.write} writes a minute. Failed sign-ins are limited to {LIMITS.badAuth} a minute per
              address. Every response carries <C>RateLimit-Limit</C>, <C>RateLimit-Remaining</C> and <C>RateLimit-Reset</C> (seconds), and a{" "}
              <C>429</C> carries <C>Retry-After</C>.
            </p>
            <p>Please poll no faster than every 30 seconds. Your lights only check in every 20 seconds anyway.</p>
          </Section>

          <Section id="versioning" title="Versioning">
            <p>
              The version is in the path. Within v1 things are only added: new endpoints, new optional fields, new fields in responses. Ignore
              fields you don&apos;t know. Anything that would break a client, such as removing or renaming a field or adding a status, waits for v2.
              v1 then keeps working for at least 6 months, with <C>Deprecation</C> and <C>Sunset</C> headers.
            </p>
          </Section>

          <Section id="terms" title="Terms">
            <p>
              bzzy is source-available under the{" "}
              <a href={`${REPO_URL}/blob/main/LICENSE.md`} className="font-medium underline underline-offset-2">
                PolyForm Noncommercial license
              </a>
              , and bzzy.ca runs on a non-commercial plan. Integrations that use the API must be free to use. Ask on GitHub if you&apos;d like an
              exception. Don&apos;t use the API to get at anyone else&apos;s account.
            </p>
          </Section>

          <Section id="changelog" title="Changelog">
            <Table head={["Date", "Change"]} rows={[["2026-11-15", "v1: tokens, status, Show now, lights and GIFs."]]} />
          </Section>
        </main>
      </div>
    </>
  );
}

// ---- pieces ----

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-4 leading-relaxed">
      <h2 id={`${id}-h`} className="border-b border-line pb-2 text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.85em] break-words">{children}</code>;
}

function Code({ label, children }: { label: string; children: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-card">
      <figcaption className="flex items-center justify-between border-b border-line px-3 py-1 text-xs text-muted">
        <span>{label}</span>
        <CopyButton value={children} label={`${label} example`} />
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

function Fact({ label, value, href, copy }: { label: string; value: string; href?: string; copy?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="flex items-center justify-between gap-2">
        {href ? (
          <a href={href} className="min-w-0 truncate font-mono text-[13px] underline underline-offset-2">
            {value}
          </a>
        ) : (
          <span className="min-w-0 truncate font-mono text-[13px]">{value}</span>
        )}
        {copy && <CopyButton value={value} label={label} />}
      </dd>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-subtle/60">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- the reference, from the OpenAPI document ----

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  anyOf?: JsonSchema[];
  format?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  $ref?: string;
};

type Operation = {
  summary: string;
  description?: string;
  "x-bzzy-scope": string;
  requestBody?: { content: { "application/json": { schema: JsonSchema } } };
};

const METHOD_TONE: Record<string, string> = {
  GET: "bg-free/15 text-free",
  PUT: "bg-away/15 text-away",
  DELETE: "bg-busy/15 text-busy",
};

function typeLabel(s: JsonSchema): string {
  if (s.anyOf) return s.anyOf.map(typeLabel).join(" or ");
  if (s.enum) return s.enum.map((e) => JSON.stringify(e)).join(", ");
  if (s.format === "date-time") return "ISO 8601 time";
  const t = Array.isArray(s.type) ? s.type.join(" or ") : (s.type ?? "any");
  if (t === "integer" && s.minimum !== undefined && s.maximum !== undefined) return `integer, ${s.minimum} to ${s.maximum}`;
  if (t === "string" && s.maxLength) return `string, up to ${s.maxLength}`;
  return t;
}

function Endpoint({ method, path, op, schemas }: { method: string; path: string; op: Operation; schemas: Record<string, JsonSchema> }) {
  const ref = op.requestBody?.content["application/json"].schema.$ref;
  const body = ref ? schemas[ref.split("/").pop()!] : null;
  const example = API_EXAMPLES[`${method} ${path}`];
  const id = `${method}-${path.slice(1)}`.toLowerCase();
  return (
    <article id={id} className="scroll-mt-20 space-y-3">
      <h3 className="flex flex-wrap items-center gap-2 font-mono text-[15px] font-medium">
        <span className={cx("rounded-md px-1.5 py-0.5 text-xs font-semibold", METHOD_TONE[method])}>{method}</span>
        <span>/v1{path}</span>
        <span className="font-sans text-xs font-normal text-muted">
          scope: <C>{op["x-bzzy-scope"]}</C>
        </span>
      </h3>
      <p className="font-medium">{op.summary}.</p>
      {op.description && <p className="text-muted">{op.description.replaceAll("`", "")}</p>}
      {body?.properties && (
        <Table
          head={["Field", "Type", "About"]}
          rows={Object.entries(body.properties).map(([name, s]) => [
            <span key="n" className="font-mono text-[13px] whitespace-nowrap">
              {name}
              {body.required?.includes(name) && <span className="text-busy"> *</span>}
            </span>,
            <span key="t" className="text-muted">
              {typeLabel(s)}
            </span>,
            s.description ?? "",
          ])}
        />
      )}
      {example?.request !== undefined && <Code label="Request body">{JSON.stringify(example.request, null, 2)}</Code>}
      {example && <Code label="Response">{JSON.stringify(example.response, null, 2)}</Code>}
    </article>
  );
}
