"use client";

import { useSyncExternalStore } from "react";
import { UpiPayPanel } from "@/components/UpiPay";

// Standalone payment page, for direct links such as /pay?pa=merchant@upi&pn=Sample%20Merchant&am=100.00.
// Inside the chat the same card opens as a sheet instead (see UpiPaySheet), so the chat isn't left.

// The query string never changes while the page is open, so there is nothing to subscribe to;
// useSyncExternalStore just gives a hydration-safe way to read it (null on the server).
const noSubscription = () => () => {};

export default function PayPage() {
  const search = useSyncExternalStore(noSubscription, () => window.location.search, () => null);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-wa-chat px-4 py-4">
      <UpiPayPanel search={search} />
    </main>
  );
}
