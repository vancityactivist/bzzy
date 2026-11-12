import type { Metadata } from "next";
import { Suspense } from "react";

import { ImageIcon } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { Badge, Container, EmptyState, PageHeader } from "@/components/ui";
import { BUILTIN_GIFS, gifsForUser } from "@/lib/gifs";
import { getCurrentUser } from "@/lib/session";

import { AddGifCard, DeleteGifButton } from "./gif-forms";

export const metadata: Metadata = { title: "GIFs" };

export default function GifsPage() {
  return (
    <Container>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <GifsContent />
      </Suspense>
    </Container>
  );
}

function Tile({
  src,
  name,
  note,
  badge,
  children,
}: {
  src: string;
  name: string;
  note?: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex aspect-[6/5] items-center justify-center bg-[#0b0b0c]">
        {/* eslint-disable-next-line @next/next/no-img-element -- animated GIFs, already sized */}
        <img src={src} alt={name} loading="lazy" className="max-h-full max-w-full" />
      </div>
      <div className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          {note && <p className="text-xs text-muted">{note}</p>}
          {badge && <Badge className="mt-1.5">{badge}</Badge>}
        </div>
        {children}
      </div>
    </li>
  );
}

const GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

async function GifsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const uploads = await gifsForUser(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="GIFs"
        description="Upload your own or add one from GIPHY or Tenor, then pick which one each status shows on the Devices page."
      />

      <AddGifCard />

      <section className="space-y-4">
        <h2 className="font-semibold tracking-tight">Yours</h2>
        {uploads.length === 0 ? (
          <EmptyState icon={<ImageIcon />} title="Nothing uploaded yet">
            GIFs you upload or add from a link show up here, ready to pick on the Devices page.
          </EmptyState>
        ) : (
          <ul className={GRID}>
            {uploads.map((g) => (
              <Tile key={g.id} src={`/api/gifs/${g.id}`} name={g.name} note={`${Math.round(g.bytes / 1024)} KB`}>
                <DeleteGifButton id={g.id} name={g.name} />
              </Tile>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold tracking-tight">Built in</h2>
        <ul className={GRID}>
          {BUILTIN_GIFS.map((g) => (
            <Tile
              key={g.id}
              src={g.path}
              name={g.name}
              badge={g.status ? `Made for ${g.status === "dnd" ? "do not disturb" : g.status}` : "Any status"}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
