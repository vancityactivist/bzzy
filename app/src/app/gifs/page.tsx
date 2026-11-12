import type { Metadata } from "next";
import { Suspense } from "react";

import { SignIn } from "@/components/sign-in";
import { Container } from "@/components/ui";
import { BUILTIN_GIFS, gifsForUser } from "@/lib/gifs";
import { getCurrentUser } from "@/lib/session";

import { DeleteGifButton, GifLinkForm, UploadGifForm } from "./gif-forms";

export const metadata: Metadata = { title: "GIFs" };

export default function GifsPage() {
  return (
    <Container size="narrow">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <GifsContent />
      </Suspense>
    </Container>
  );
}

function Tile({ src, name, note, children }: { src: string; name: string; note?: string; children?: React.ReactNode }) {
  return (
    <li className="overflow-hidden rounded-lg border border-line bg-background">
      <div className="flex aspect-[6/5] items-center justify-center bg-[#0b0b0c]">
        {/* eslint-disable-next-line @next/next/no-img-element -- animated GIFs, already sized */}
        <img src={src} alt={name} loading="lazy" className="max-h-full max-w-full" />
      </div>
      <div className="flex items-center gap-2 p-2 text-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
        {children}
      </div>
    </li>
  );
}

async function GifsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const uploads = await gifsForUser(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">GIFs</h1>
        <p className="text-sm text-muted">
          Upload your own or add one from GIPHY or Tenor, then pick which one each status shows on the Devices page. Uploads are resized to fit the
          screen (240 × 200).
        </p>
      </div>

      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="font-semibold">Upload</h2>
        <div className="mt-3">
          <UploadGifForm />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="font-semibold">From GIPHY or Tenor</h2>
        <p className="mt-1 text-sm text-muted">
          Find a GIF on{" "}
          <a href="https://giphy.com" target="_blank" rel="noreferrer" className="underline">
            giphy.com
          </a>{" "}
          or{" "}
          <a href="https://tenor.com" target="_blank" rel="noreferrer" className="underline">
            tenor.com
          </a>
          , or in the GIPHY app on your phone. Tap Share, then Copy link, and paste it here.
        </p>
        <div className="mt-3">
          <GifLinkForm />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Yours</h2>
        {uploads.length === 0 ? (
          <p className="text-sm text-muted">Nothing uploaded yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {uploads.map((g) => (
              <Tile key={g.id} src={`/api/gifs/${g.id}`} name={g.name} note={`${Math.round(g.bytes / 1024)} KB`}>
                <DeleteGifButton id={g.id} />
              </Tile>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Built in</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BUILTIN_GIFS.map((g) => (
            <Tile key={g.id} src={g.path} name={g.name} note={g.status ? `Made for ${g.status === "dnd" ? "do not disturb" : g.status}` : "Any status"} />
          ))}
        </ul>
      </section>
    </div>
  );
}
