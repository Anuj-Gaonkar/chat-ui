"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { logChatEvent } from "@/lib/api";

// Hands a payment off to the phone's UPI apps. Payment details come from a query string, e.g.
//   ?pa=merchant@upi&pn=Sample%20Merchant&am=100.00&tn=Account%20funding&tr=ORD123
// With no payee (pa + pn) it runs as a plain launcher that just opens the UPI app chooser.
// Shown two ways: as a sheet over the live chat (UpiPaySheet), and as the standalone /pay page.

interface PayParams {
  pa: string | null;
  pn: string | null;
  am: string | null;
  tn: string | null;
  tr: string | null;
  mc: string | null;
}

type Platform = "android" | "ios" | "other";

// iOS app list. pay = scheme + path for a payment, open = bare scheme (launcher mode).
// Verify each scheme on a real device; apps can change them.
const IOS_APPS = [
  { name: "Google Pay", pay: "gpay://upi/pay?", open: "gpay://" },
  { name: "PhonePe", pay: "phonepe://pay?", open: "phonepe://" },
  { name: "Paytm", pay: "paytmmp://pay?", open: "paytmmp://" },
  { name: "BHIM", pay: "bhim://upi/pay?", open: "bhim://" },
  { name: "CRED", pay: "credpay://upi/pay?", open: "credpay://" },
  { name: "Other UPI app", pay: "upi://pay?", open: "upi://pay" },
];

function detectPlatform(): Platform {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return "other";
}

// The device never changes while the panel is open, so there is nothing to subscribe to;
// useSyncExternalStore just gives a hydration-safe way to read it (null on the server).
const noSubscription = () => () => {};

function parseParams(search: string): PayParams | "invalid" {
  const qs = new URLSearchParams(search);
  const am = qs.get("am");
  if (am && !/^\d+(\.\d{1,2})?$/.test(am)) return "invalid";
  return {
    pa: qs.get("pa"),
    pn: qs.get("pn"),
    am,
    tn: qs.get("tn"),
    tr: qs.get("tr"),
    mc: qs.get("mc"),
  };
}

function buildQuery(d: PayParams) {
  // encodeURIComponent (not URLSearchParams) so spaces become %20, not "+"
  const p: Record<string, string | null> = {
    pa: d.pa,
    pn: d.pn,
    am: d.am,
    cu: "INR",
    tn: d.tn,
    tr: d.tr,
    mc: d.mc,
  };
  return Object.keys(p)
    .filter((k) => p[k])
    .map((k) => `${k}=${encodeURIComponent(p[k] as string)}`)
    .join("&");
}

const BUTTON =
  "block w-full rounded-xl px-4 py-3.5 text-base font-semibold no-underline transition-opacity hover:brightness-95";
const PRIMARY = `${BUTTON} bg-wa-accent text-white`;
const SECONDARY = `${BUTTON} border-[1.5px] border-wa-accent bg-transparent text-wa-accent`;

/**
 * The payment card. {@code search} is the query string with the payee details (null until the page
 * has hydrated); {@code returnHint} finishes "After paying, return to ...".
 */
export function UpiPayPanel({
  search,
  returnHint = "WhatsApp",
}: {
  search: string | null;
  returnHint?: string;
}) {
  const platform = useSyncExternalStore<Platform | null>(noSubscription, detectPlatform, () => null);
  // Set on iOS when a tapped app never took over the page.
  const [missingApp, setMissingApp] = useState<string | null>(null);

  const parsed = search === null ? null : parseParams(search);
  const invalid = parsed === "invalid";
  const params = parsed === "invalid" ? null : parsed;
  const launcher = !params || !params.pa || !params.pn;
  const query = !params || launcher ? "" : buildQuery(params);
  // No package specified -> Android shows the app chooser (tray) for UPI apps.
  const intentUrl = `intent://pay${query ? `?${query}` : ""}#Intent;scheme=upi;end`;

  // Best-effort auto launch on Android (payment mode only); the button is the fallback.
  useEffect(() => {
    if (platform !== "android" || launcher) return;
    const timer = setTimeout(() => {
      // Nobody tapped anything here: the UPI app chooser opens by itself, so say so in the label.
      logChatEvent("UPI_APP_CLICKED", "Android auto-open");
      window.location.href = intentUrl;
    }, 600);
    return () => clearTimeout(timer);
  }, [platform, launcher, intentUrl]);

  // iOS cannot tell us whether an app is installed. We try to open it and, if the page
  // is not hidden/unloaded within 1.5s, assume the app is missing.
  function tryOpen(name: string, url: string) {
    setMissingApp(null);
    let opened = false;
    const onVis = () => {
      if (document.hidden) opened = true;
    };
    const onHide = () => {
      opened = true;
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    window.location.assign(url);
    setTimeout(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      if (!opened) setMissingApp(name);
    }, 1500);
  }

  let title = "Complete your payment";
  let note = "";
  if (invalid) {
    title = "Something went wrong";
    note = "This payment link is invalid.";
  } else if (params) {
    if (launcher) title = "Open a UPI app";
    if (platform === "android") {
      note = `You will be asked to choose a UPI app. After paying, return to ${returnHint}.`;
    } else if (platform === "ios") {
      note = `Choose the UPI app you use. After paying, return to ${returnHint}.`;
    } else if (platform === "other") {
      note = "Please open this link on your mobile phone to pay with a UPI app.";
    }
  }

  return (
    <div className="w-full max-w-[420px] rounded-2xl bg-wa-in p-6 text-center text-wa-text shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
      <h1 className="mb-1 text-xl font-semibold">{title}</h1>
      {params && !launcher && (
        <>
          {/* Rendered as text, never as HTML. */}
          <p className="mb-4 text-wa-meta">Pay to {params.pn}</p>
          {params.am && <div className="mb-5 mt-2 text-3xl font-bold">₹{params.am}</div>}
        </>
      )}

      {params && !invalid && platform === "android" && (
        <div className="my-2.5">
          <a href={intentUrl} className={PRIMARY} onClick={() => logChatEvent("UPI_APP_CLICKED", "Android UPI chooser")}>
            {launcher ? "Open UPI apps" : "Pay with UPI app"}
          </a>
        </div>
      )}

      {params && !invalid && platform === "ios" && (
        <div className="flex flex-col gap-2.5">
          {IOS_APPS.map((app) => {
            const url = launcher ? app.open : app.pay + query;
            return (
              <a
                key={app.name}
                href={url}
                className={SECONDARY}
                onClick={(e) => {
                  e.preventDefault();
                  logChatEvent("UPI_APP_CLICKED", app.name);
                  tryOpen(app.name, url);
                }}
              >
                {app.name}
              </a>
            );
          })}
        </div>
      )}

      {missingApp && (
        <p role="alert" className="mt-4 text-sm leading-snug text-red-600">
          {missingApp} doesn&apos;t seem to be installed. Please try another UPI app.
        </p>
      )}
      {note && (
        <p className={`mt-4 text-sm leading-snug ${invalid ? "text-red-600" : "text-wa-meta"}`}>
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * The payment card as a sheet over the chat. The chat page stays mounted underneath, so closing it
 * (or coming back from a UPI app) leaves the conversation exactly where it was.
 */
export function UpiPaySheet({ search, onClose }: { search: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Complete your payment"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center"
      onClick={onClose}
    >
      <div className="flex w-full max-w-[420px] flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        <UpiPayPanel search={search} returnHint="this chat" />
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-wa-in px-4 py-3 text-base font-medium text-wa-text shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:brightness-95"
        >
          Back to chat
        </button>
      </div>
    </div>
  );
}
