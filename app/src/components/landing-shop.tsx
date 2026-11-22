import { dollars, SHOP_URL, type ShopBatch, shortDate } from "@/lib/shop-batch";

import { buttonClass } from "./ui";

// The landing page's view of the shop (shop.bzzy.ca), from its public batch feed
// (lib/shop-batch.ts). Every number here comes from the shop, so changing a price or a
// date there never needs a deploy here.

/** One line under the hero's buttons: the batch at a glance. */
export function BatchLine({ batch }: { batch: ShopBatch }) {
  if (batch.state === "soon") {
    return <p className="mt-5 text-sm text-muted">Built lights ship in small batches across Canada. The next batch opens soon.</p>;
  }
  return (
    <p className="mt-5 text-sm text-muted">
      <span className="font-medium text-foreground">Batch {batch.number} is {batch.full ? "full" : "open"}:</span>{" "}
      {batch.reserved} of {batch.capacity} reserved{batch.shipsBy ? `, ships by ${shortDate(batch.shipsBy)}` : ""}.
    </p>
  );
}

const STEPS = (deposit: number) => [
  {
    title: "Reserve a spot",
    body: deposit
      ? `Pay a ${dollars(deposit)} refundable deposit and save a card with Stripe. Nothing else is charged yet.`
      : "Save a card with Stripe. Nothing is charged yet, and you can cancel any time before the batch closes.",
  },
  {
    title: "The batch closes",
    body: "When it's full or on its close date, everyone is charged at once. If it doesn't reach its minimum, nobody is charged.",
  },
  {
    title: "Built and paired to you",
    body: "Each light is built, tested and linked to your bzzy account before it ships, so your status is already on it.",
  },
  { title: "It ships", body: "By the ship-by date shown on the batch. Plug it in, join your Wi-Fi, done. Canada only for now." },
];

/** "Get one built": how a batch works, beside the live batch. */
export function BuySection({ batch }: { batch: ShopBatch }) {
  const deposit = batch.state === "open" ? batch.depositCents : 0;
  return (
    <section className="lp-section lp-section--rule" id="buy" aria-labelledby="buy-h">
      <div className="lp-wrap lp-grid">
        <div className="lp-c1-6">
          <h2 id="buy-h">Get one built</h2>
          <p className="lead">Not up for soldering? Reserve a spot in the next batch. We build it, pair it to your account and ship it ready to plug in.</p>
          <div className="mt-10">
            <ol className="lp-steps">
              {STEPS(deposit).map((s) => (
                <li key={s.title}>
                  <h3>{s.title}</h3>
                  <p className="mt-3 text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="lp-c8-12">
          <div className="lp-pin">
            <BatchPanel batch={batch} />
          </div>
        </div>
      </div>
    </section>
  );
}

function BatchPanel({ batch }: { batch: ShopBatch }) {
  if (batch.state === "soon") {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
        <p className="text-sm text-muted">Next batch</p>
        <p className="mt-2 text-[1.625rem] leading-tight font-medium">Opens soon</p>
        <p className="mt-3 text-muted">Leave your email and the shop sends you one message when it opens. Nothing else.</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <a className={buttonClass("primary", "md", "h-12 px-5 text-[15px]")} href={batch.notifyUrl}>
            Email me when it opens
          </a>
          <a className="text-sm text-muted underline underline-offset-4 hover:text-foreground" href={`${SHOP_URL}/`}>
            Visit the shop
          </a>
        </div>
      </div>
    );
  }

  const pct = (n: number) => `${Math.min(100, (n / batch.capacity) * 100)}%`;
  const rows: [string, string][] = [
    ["Reserved", `${batch.reserved} of ${batch.capacity}`],
    ["Needed to build", String(batch.minimum)],
    ["Closes", batch.closesAt ? shortDate(batch.closesAt) : "When it fills"],
    ["Ships by", batch.shipsBy ? shortDate(batch.shipsBy) : "Set at close"],
    ["Today", batch.depositCents ? `${dollars(batch.depositCents)} refundable deposit` : "Nothing"],
  ];
  return (
    <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
      <p className="text-sm text-muted">
        Batch {batch.number} · {batch.full ? "full" : "open"}
      </p>
      <p className="mt-2 text-[1.625rem] leading-tight font-medium">
        {dollars(batch.priceCents)} <span className="text-base font-normal text-muted">CAD + shipping</span>
      </p>
      <div className="mt-6">
        <div
          className="relative h-2 rounded-full bg-subtle"
          role="img"
          aria-label={`${batch.reserved} of ${batch.capacity} lights reserved; ${batch.minimum} needed to build`}
        >
          <div className="h-full rounded-full bg-signal" style={{ width: pct(batch.reserved) }} />
          {/* The minimum, as a tick on the bar. */}
          <span className="absolute -top-1 h-4 w-px bg-foreground/60" style={{ left: pct(batch.minimum) }} aria-hidden />
        </div>
      </div>
      <dl className="mt-6 mb-0 divide-y divide-line border-y border-line">
        {rows.map(([term, detail]) => (
          <div key={term} className="grid grid-cols-[9rem_minmax(0,1fr)] items-baseline gap-4 py-3">
            <dt className="text-sm text-muted">{term}</dt>
            <dd className="m-0 font-mono text-[15px] text-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        {batch.full ? (
          <a className={buttonClass("primary", "md", "h-12 px-5 text-[15px]")} href={batch.notifyUrl}>
            Email me about the next batch
          </a>
        ) : (
          <a className={buttonClass("primary", "md", "h-12 px-5 text-[15px]")} href={batch.reserveUrl}>
            Reserve a spot
          </a>
        )}
        <a className="text-sm text-muted underline underline-offset-4 hover:text-foreground" href={`${SHOP_URL}/terms`}>
          How charging works
        </a>
      </div>
    </div>
  );
}
