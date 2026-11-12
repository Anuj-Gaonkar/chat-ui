"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { JourneyStep } from "@/components/JourneyStep";
import { ApiError, SessionFrame, getChatSession, getCustomerFrame } from "@/lib/api";

const STATUS_STYLE: Record<SessionFrame["status"], string> = {
  ACTIVE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  ABANDONED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  ERROR: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function JourneyPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [frame, setFrame] = useState<SessionFrame | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The backend only shows a verified browser its own number's journey, so start from that number.
  useEffect(() => {
    void (async () => {
      try {
        const session = await getChatSession();
        if (session.verified && session.customerId) {
          setPhoneNumber(session.customerId);
          await handleLookup(session.customerId);
        }
      } catch {
        // No verified session: the lookup box stays empty and a manual lookup reports the denial.
      }
    })();
    // Runs once on mount; handleLookup only uses state setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLookup(number: string = phoneNumber) {
    const trimmed = number.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setFrame(null);
    try {
      const result = await getCustomerFrame(trimmed);
      setFrame(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "NOT_FOUND"
            ? "No conversation found for that phone number yet."
            : err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-white dark:bg-black">
      <header className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Customer Journey Viewer
          </h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            ← Back to chat
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Look up a customer&apos;s whole conversation, reconstructed from their session history.
        </p>
      </header>

      <div className="flex gap-2 px-4 py-4">
        <input
          type="tel"
          inputMode="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          placeholder="Customer phone number"
          className="flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={() => handleLookup()}
          disabled={isLoading || !phoneNumber.trim()}
          className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Loading…" : "View journey"}
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {frame && (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          <div className="rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                {frame.sessionId}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[frame.status]}`}>
                {frame.status}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              <dt>Customer</dt>
              <dd className="text-gray-900 dark:text-gray-100">{frame.customerId}</dd>
              <dt>Started</dt>
              <dd>{formatDateTime(frame.startedAt)}</dd>
              <dt>Ended</dt>
              <dd>{formatDateTime(frame.endedAt)}</dd>
            </dl>

            {(frame.conclusionCode || frame.entryReasonCode) && (
              <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Conclusion
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {frame.conclusionCode && (
                    <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                      {frame.conclusionCode}
                    </span>
                  )}
                  {frame.entryReasonCode && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      entered via: {frame.entryReasonCode}
                    </span>
                  )}
                </div>
              </div>
            )}

            {frame.pathSummary && (
              <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Path</p>
                <p className="text-xs text-gray-900 dark:text-gray-100">{frame.pathSummary}</p>
              </div>
            )}

            {Object.keys(frame.context).length > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Collected during the conversation
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  {Object.entries(frame.context).map(([key, value]) => (
                    <div className="contents" key={key}>
                      <dt className="text-gray-500 dark:text-gray-400">{key}</dt>
                      <dd className="break-all text-gray-900 dark:text-gray-100">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {frame.steps.map((step) => (
              <JourneyStep key={step.sequenceNo} step={step} />
            ))}
          </div>
        </div>
      )}

      {!frame && !error && !isLoading && (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Enter a phone number above to view that customer&apos;s conversation.
        </div>
      )}
    </div>
  );
}
