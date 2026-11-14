"use client";

import { useActionState, useState, useTransition } from "react";

import { DevicePreview } from "@/components/device-preview";
import { CheckIcon, XIcon } from "@/components/icons";
import { Badge, Button, Card, CardHeader, cx, Field, Input, Select } from "@/components/ui";
import { TEXT_MAX } from "@/lib/protocol";
import { FLASH_FOR, PUSH_COLORS, PUSH_DURATIONS, PUSH_FLASHES, pushLeds, type PushInput } from "@/lib/push-rules";
import { screenText, viewFor, withShow, wrapBar, wrapMessage } from "@/lib/screen";

import type { LibraryGif } from "@/app/studio";
import { endPushAction, type PushResult, sendPushAction } from "../actions";

const TEXT_ONLY = "none";

export type PushMember = { userId: string; name: string };

// The composer: what to show, who gets it, whether the ring flashes, and for how long.
// The preview on the left is what each light will show (on top of a "free" status).
export function PushComposer({ teamId, members, library }: { teamId: string; members: PushMember[]; library: LibraryGif[] }) {
  const [gif, setGif] = useState<string>(library[0]?.choice ?? TEXT_ONLY);
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [target, setTarget] = useState<"all" | "users">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [flash, setFlash] = useState<PushInput["flash"]>("pulse");
  const [color, setColor] = useState("");
  const [speed, setSpeed] = useState(2);
  const [flashFor, setFlashFor] = useState(30);

  const [result, action, pending] = useActionState<PushResult, FormData>(async (prev, fd) => {
    const r = await sendPushAction(teamId, prev, fd);
    if (r?.ok) setText("");
    return r;
  }, null);

  const gifSrc = gif === TEXT_ONLY ? null : (library.find((g) => g.choice === gif)?.src ?? null);
  const clean = screenText(text.trim());
  const ready = (!!gifSrc || !!clean) && (target === "all" || picked.length > 0);
  const view = withShow(viewFor({ status: "free", text: "", until: 0 }), {
    text: clean,
    until: 0, // the show layouts don't draw it
    gif: !!gifSrc,
  });
  const ring = pushLeds({ flash, color, speed, flashFor: 0 });
  const shown = clean ? (gifSrc ? wrapBar(clean) : wrapMessage(clean).lines).join(" ") : "";
  const cut = clean && shown.replace(/ +/g, " ") !== clean.replace(/ +/g, " ");

  return (
    <Card>
      <CardHeader
        title="Send a push"
        description="Goes on top of whatever each light shows, including their own show now. The top button on a light dismisses it for that person."
      />
      <form action={action} className="mt-5 grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex justify-center md:sticky md:top-20 md:self-start">
          <DevicePreview view={view} gifSrc={gifSrc} ring={ring} scale={0.75} className="m-4" />
        </div>

        <div className="min-w-0 space-y-5">
          <fieldset>
            <legend className="text-sm font-medium">GIF</legend>
            <div
              role="radiogroup"
              aria-label="GIF to show"
              className="-mx-1.5 mt-1.5 grid max-h-[11.5rem] grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-2 overflow-y-auto p-1.5"
            >
              <Tile name="Just a message" checked={gif === TEXT_ONLY} onPick={() => setGif(TEXT_ONLY)} />
              {library.map((g) => (
                <Tile key={g.choice} name={g.name} src={g.src} checked={gif === g.choice} onPick={() => setGif(g.choice)} />
              ))}
            </div>
            <input type="hidden" name="gif" value={gif} />
          </fieldset>

          <Field
            label="Message"
            htmlFor="push-text"
            hint={cut ? `Only “${shown}” fits${gifSrc ? " under a GIF" : ""}.` : "Optional with a GIF. Plain letters only: emoji are left out."}
          >
            <Input
              id="push-text"
              name="text"
              maxLength={TEXT_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Fire drill at 3, meet out front"
              autoComplete="off"
            />
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">Who gets it</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Chip checked={target === "all"} onClick={() => setTarget("all")}>
                Everyone ({members.length})
              </Chip>
              <Chip checked={target === "users"} onClick={() => setTarget("users")}>
                Pick people
              </Chip>
            </div>
            <input type="hidden" name="target" value={target} />
            {target === "users" && (
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="People">
                {members.map((m) => {
                  const on = picked.includes(m.userId);
                  return (
                    <Chip
                      key={m.userId}
                      checked={on}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.userId) : [...p, m.userId]))}
                    >
                      {m.name}
                    </Chip>
                  );
                })}
                {picked.map((id) => (
                  <input key={id} type="hidden" name="users" value={id} />
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Flash the ring</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PUSH_FLASHES.map((f) => (
                <Chip key={f.value} checked={flash === f.value} onClick={() => setFlash(f.value)}>
                  {f.label}
                </Chip>
              ))}
            </div>
            <input type="hidden" name="flash" value={flash} />
            {flash !== "none" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
                  {PUSH_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={color === c.value}
                      aria-label={c.label}
                      title={c.label}
                      onClick={() => setColor(c.value)}
                      className={cx(
                        "flex size-8 items-center justify-center rounded-full ring-1 ring-line ring-inset transition-shadow",
                        color === c.value && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                      )}
                      style={{
                        background: c.value || "conic-gradient(#00c828 0 25%, #ff1400 0 50%, #a000ff 0 75%, #ff8c00 0)",
                      }}
                    >
                      {color === c.value && (
                        <CheckIcon className={cx("size-4", c.value === "#ffffff" || c.value === "#ffd400" ? "text-black" : "text-white")} strokeWidth={3} />
                      )}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="color" value={color} />
                <div className="flex flex-wrap gap-2">
                  <Select
                    name="speed"
                    aria-label="Speed"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    wrapperClassName="w-36"
                  >
                    <option value={1}>Slow</option>
                    <option value={2}>Normal</option>
                    <option value={3}>Fast</option>
                  </Select>
                  <Select
                    name="flashFor"
                    aria-label="How long it flashes"
                    value={flashFor}
                    onChange={(e) => setFlashFor(Number(e.target.value))}
                    wrapperClassName="w-48"
                  >
                    {FLASH_FOR.map((f) => (
                      <option key={f.seconds} value={f.seconds}>
                        Flash {f.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <p className="text-xs text-muted">
                  Never faster than 3 flashes a second. Lights on older firmware show the push without flashing until they update.
                </p>
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button variant="primary" disabled={pending || !ready} className="px-5">
              {pending ? "Sending…" : "Send push"}
            </Button>
            <Select
              name="minutes"
              aria-label="How long"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              wrapperClassName="max-w-52"
            >
              {PUSH_DURATIONS.map((d) => (
                <option key={d.minutes} value={d.minutes}>
                  {d.label}
                </option>
              ))}
            </Select>
            {result?.ok === false && (
              <p className="basis-full text-sm text-danger" role="alert">
                {result.error}
              </p>
            )}
            {result?.ok && !pending && <p className="basis-full text-sm text-muted">Sent. Lights pick it up within about 20 seconds.</p>}
          </div>
        </div>
      </form>
    </Card>
  );
}

function Chip({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        checked ? "border-foreground bg-foreground text-background" : "border-line bg-card hover:border-line-strong",
      )}
    >
      {checked && <CheckIcon className="size-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}

function Tile({ name, src, checked, onPick }: { name: string; src?: string; checked: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={name}
      title={name}
      onClick={onPick}
      className={cx(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-[#0b0b0c] transition-shadow hover:ring-2 hover:ring-line-strong",
        checked && "ring-2 ring-foreground ring-offset-2 ring-offset-card hover:ring-foreground",
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- animated GIFs, already sized
        <img src={src} alt="" loading="lazy" className="max-h-full max-w-full" />
      ) : (
        <span className="text-base leading-none font-semibold text-white/85">Aa</span>
      )}
    </button>
  );
}

// ---- what's been sent ----

export type PushSummary = {
  id: string;
  text: string;
  gifSrc: string | null;
  gifName: string | null;
  who: string; // "Everyone" or the names picked
  acked: number;
  of: number;
  until: number;
  endedAt: number | null;
  live: boolean;
  by: string | null;
  flash: string | null;
  sentAgo: string;
};

export function PushList({ teamId, pushes }: { teamId: string; pushes: PushSummary[] }) {
  if (pushes.length === 0) return null;
  return (
    <Card padding="none" className="overflow-hidden">
      <CardHeader title="Pushes" description="Live now, and from the last day." className="p-5 pb-3 sm:p-6 sm:pb-3" />
      <ul className="divide-y divide-line border-t border-line">
        {pushes.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 sm:px-6">
            {p.gifSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- small animated thumbnail
              <img src={p.gifSrc} alt="" className={cx("size-11 shrink-0 rounded-lg bg-black object-cover", !p.live && "opacity-50")} />
            ) : (
              <span
                aria-hidden
                className={cx(
                  "flex size-11 shrink-0 items-center justify-center rounded-lg bg-black text-sm font-semibold text-white/85",
                  !p.live && "opacity-50",
                )}
              >
                Aa
              </span>
            )}
            <div className="min-w-0 flex-1 basis-48 text-sm">
              <p className="truncate font-medium">{p.text ? `“${p.text}”` : p.gifName}</p>
              <p className="text-muted">
                {p.who} · {p.acked} of {p.of} dismissed
                {p.flash && ` · ${p.flash}`} · {p.by ? `${p.by}, ` : ""}
                {p.sentAgo}
              </p>
            </div>
            {p.live ? (
              <>
                <Badge tone="inverse">{p.until ? `Until ${clock(p.until)}` : "Until ended"}</Badge>
                <EndPushButton teamId={teamId} pushId={p.id} />
              </>
            ) : (
              <Badge>{p.endedAt ? "Ended" : "Finished"}</Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EndPushButton({ teamId, pushId }: { teamId: string; pushId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await endPushAction(teamId, pushId);
            setError(r?.ok === false ? r.error : null);
          })
        }
      >
        <XIcon />
        {pending ? "Ending…" : "End it"}
      </Button>
      {error && (
        <p className="basis-full text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

// "3:30 PM" in the light's fixed UTC-7, like the studio.
function clock(sec: number) {
  return new Date(sec * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Etc/GMT+7" });
}
