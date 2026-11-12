"use client";

import { useOptimistic, useTransition } from "react";

import { RefreshIcon } from "@/components/icons";
import { Badge, Button } from "@/components/ui";
import type { FirmwareState } from "@/lib/firmware";

import { setAutoUpdateAction, updateNowAction } from "../actions";

function describe(s: FirmwareState, autoUpdate: boolean): { badge: string; text: string | null; action: string | null } {
  switch (s.kind) {
    case "unknown":
      return {
        badge: "Firmware unknown",
        text: "The light hasn't said which firmware it runs. Lights flashed before updates existed need one more USB flash.",
        action: null,
      };
    case "current":
      return { badge: `Firmware ${s.version}`, text: null, action: null };
    case "unsupported":
      return { badge: `Firmware ${s.version}`, text: "The latest release has no file for this board.", action: null };
    case "test":
      return {
        badge: "Test build",
        text: "Flashed over USB, so it never updates on its own.",
        action: s.latest ? `Install ${s.latest}` : null,
      };
    case "available":
      return {
        badge: `Firmware ${s.version}`,
        text: autoUpdate
          ? `${s.latest} is out. It installs the next time you're free or away.`
          : `${s.latest} is out.`,
        action: "Update now",
      };
    case "updating":
      return {
        badge: s.version ? `Firmware ${s.version}` : "Test build",
        text: `Updating to ${s.latest}. The light restarts when it's done, usually within a minute.`,
        action: null,
      };
    case "failed":
      return {
        badge: `Firmware ${s.version}`,
        text: `${s.latest} didn't start properly, so the light went back to ${s.version}.`,
        action: "Try again",
      };
  }
}

/** Firmware version, auto-update switch and "Update now". A full-width row in the device card. */
export function DeviceFirmware({
  deviceId,
  state,
  autoUpdate,
  canManage,
}: {
  deviceId: string;
  state: FirmwareState;
  autoUpdate: boolean;
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [auto, setAuto] = useOptimistic(autoUpdate);
  const d = describe(state, auto);

  return (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
      <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone={state.kind === "available" || state.kind === "failed" ? "inverse" : "neutral"}>{d.badge}</Badge>
        {d.text && <span className="text-muted">{d.text}</span>}
      </div>
      {canManage && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={auto}
              disabled={pending}
              onChange={(e) => {
                const v = e.target.checked;
                start(async () => {
                  setAuto(v);
                  await setAutoUpdateAction(deviceId, v);
                });
              }}
            />
            Update automatically
          </label>
          {d.action && (
            <Button size="sm" disabled={pending} onClick={() => start(() => updateNowAction(deviceId))}>
              <RefreshIcon />
              {d.action}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
