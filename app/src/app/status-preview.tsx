"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import { DevicePreview } from "@/components/device-preview";
import { TEXT_MAX, type Status } from "@/lib/protocol";
import { screenText, type ScreenView } from "@/lib/screen";

// The message box and the preview sit in different parts of the page, so the
// draft message is shared through context.
const Draft = createContext<{ text: string; setText: (t: string) => void }>({ text: "", setText: () => {} });

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [text, setText] = useState("");
  return <Draft.Provider value={{ text, setText }}>{children}</Draft.Provider>;
}

export function MessageInput() {
  const { setText } = useContext(Draft);
  const ref = useRef<HTMLInputElement>(null);
  // React resets the form after the status is sent; clear the draft with it.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const clear = () => setText("");
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, [setText]);
  return (
    <input
      ref={ref}
      name="text"
      maxLength={TEXT_MAX}
      onChange={(e) => setText(e.target.value)}
      placeholder="On a call, back at 3"
      className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2"
    />
  );
}

export type PreviewDevice = { id: string; name: string; view: ScreenView; gifs: Record<Status, string | null> };

export function LivePreview({ devices }: { devices: PreviewDevice[] }) {
  const { text } = useContext(Draft);
  const [index, setIndex] = useState(0);
  const device = devices[Math.min(index, devices.length - 1)];
  if (!device) return null;
  const draft = screenText(text.trim());
  const view = draft ? { ...device.view, text: draft } : device.view;
  const gif = view.status === "unknown" ? null : device.gifs[view.status];

  return (
    <figure className="flex flex-col items-center gap-3">
      <DevicePreview view={view} gifSrc={gif} scale={0.6} className="m-4" />
      <figcaption className="text-center text-xs text-muted">
        {devices.length > 1 ? (
          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            aria-label="Device to preview"
            className="rounded-md border border-line bg-background px-2 py-1"
          >
            {devices.map((d, i) => (
              <option key={d.id} value={i}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          device.name
        )}
        {draft && <span className="block">With your message: pick a status to send it</span>}
      </figcaption>
    </figure>
  );
}
