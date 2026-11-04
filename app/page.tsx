"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage, formatClock } from "@/components/MessageBubble";
import { UpiPaySheet } from "@/components/UpiPay";
import { MessageList } from "@/components/MessageList";
import { PhoneGate } from "@/components/PhoneGate";
import {
  ApiError,
  ConversationResponse,
  OptionResponse,
  SessionStatus,
  replyToConversation,
  getChatSession,
  startChatSession,
  startConversation,
  verifyChatPhone,
} from "@/lib/api";

let nextMessageId = 0;
function newMessageId() {
  nextMessageId += 1;
  return `m${nextMessageId}`;
}

const STATUS_LABEL: Record<Exclude<SessionStatus, "ACTIVE">, string> = {
  COMPLETED: "Conversation completed.",
  ABANDONED: "Conversation abandoned.",
  EXPIRED: "Conversation expired.",
  ERROR: "Conversation ended due to an error.",
};

// The "start a new conversation" footer is a testing aid; production customers don't get it.
const SHOW_RESTART_FOOTER = process.env.NODE_ENV !== "production";

// "checking": resolving who this browser is. "needsPhone": it has a pending session and must type its
// number. "ready": it has a verified session. "blocked": it has no usable session.
// "completed": the customer already finished this chat. "inUse": the link was first opened in another
// browser, which keeps the number for now.
type Access = "checking" | "needsPhone" | "ready" | "blocked" | "completed" | "inUse";

export default function Home() {
  const [access, setAccess] = useState<Access>("checking");
  // The verified number, as told by the backend once the customer has confirmed it.
  const [customerId, setCustomerId] = useState("");
  // The chat this link is for, as told by the backend; undefined means the default chat.
  const [entryCode, setEntryCode] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [options, setOptions] = useState<OptionResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The query string of the open payment sheet (payee details), or null while it is closed.
  const [paySearch, setPaySearch] = useState<string | null>(null);

  const hasStarted = sessionId !== null;
  const isActive = status === "ACTIVE";

  function applyResponse(response: ConversationResponse) {
    setSessionId(response.sessionId);
    setStatus(response.status);
    setOptions(response.options);
    // A rejoined chat comes back with every bubble so far, the last of which is the pending question
    // (and carries its button). It replaces what is on screen rather than adding to it.
    if (response.transcript) {
      const lastBot = response.transcript.map((entry) => entry.role).lastIndexOf("bot");
      setMessages(
        response.transcript.map((entry, index) => ({
          id: newMessageId(),
          role: entry.role,
          text: entry.text,
          time: entry.time ? formatClock(new Date(entry.time)) : "",
          button: index === lastBot ? response.button : null,
        }))
      );
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id: newMessageId(),
        role: "bot",
        text: response.message,
        time: formatClock(),
        button: response.button,
      },
    ]);
  }

  // Opened from the WhatsApp CTA link (/?p=<number>, plus &e=<chat> for a non-default chat), the number
  // is exchanged for a pending session cookie and dropped from the address bar; the customer must then
  // type it back to get in. Without it (e.g. a reload) the cookie from the earlier visit is what
  // identifies the browser, and the backend remembers which chat the link was for.
  const sessionStarted = useRef(false);
  useEffect(() => {
    // React StrictMode runs effects twice in dev; a second start would race the first.
    if (sessionStarted.current) return;
    sessionStarted.current = true;

    const linkParams = new URLSearchParams(window.location.search);
    const linkNumber = linkParams.get("p");
    const linkEntry = linkParams.get("e") ?? undefined;
    void (async () => {
      try {
        const session = linkNumber
          ? await startChatSession(linkNumber, linkEntry)
          : await getChatSession();
        // The number has been handed to the backend; drop it so it isn't left in the address bar.
        if (linkNumber) window.history.replaceState(null, "", window.location.pathname);
        setEntryCode(session.entryCode);
        // Finished before: say so straight away, without asking for the number first.
        if (session.completed) {
          setAccess("completed");
          return;
        }
        if (!session.verified) {
          setAccess("needsPhone");
          return;
        }
        // A verified session always comes back with its number (GET /api/chat-session).
        const id = session.customerId ?? (await getChatSession()).customerId ?? "";
        setCustomerId(id);
        setAccess("ready");
        // Open the chat straight away, on a fresh tap of the link and on a reload alike (e.g. coming
        // back from a UPI app). The backend returns the customer's unfinished conversation with its
        // transcript, or "Feedback submitted" if they finished it, so this can't open a second one.
        await handleStart(id, session.entryCode);
      } catch (err) {
        if (err instanceof ApiError && err.code === "LINK_ALREADY_OPENED") {
          setAccess("inUse");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
        setAccess("blocked");
      }
    })();
    // handleStart only uses state setters, which are stable, so running this once is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A finished chat left open in a tab: coming back to it later (switching back to the tab or app, or
  // the browser restoring the page from memory) shows "Feedback submitted" instead of the old chat.
  useEffect(() => {
    if (status !== "COMPLETED") return;
    function showFeedbackSubmitted() {
      setMessages([]);
      setSessionId(null);
      setStatus(null);
      setOptions([]);
      setError(null);
      setPaySearch(null);
      setAccess("completed");
    }
    let wasHidden = document.visibilityState === "hidden";
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") wasHidden = true;
      else if (wasHidden) showFeedbackSubmitted();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) showFeedbackSubmitted();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [status]);

  async function handleVerify(typedNumber: string) {
    setIsLoading(true);
    setError(null);
    try {
      const session = await verifyChatPhone(typedNumber);
      const id = session.customerId ?? "";
      setCustomerId(id);
      setAccess("ready");
      await handleStart(id, session.entryCode ?? entryCode);
    } catch (err) {
      // An expired or locked session can't be retried from here; a mismatch or a malformed number can.
      if (err instanceof ApiError && err.code !== "PHONE_MISMATCH" && err.code !== "VALIDATION_FAILED") {
        setAccess("blocked");
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStart(
    id: string = customerId,
    entry: string | undefined = entryCode,
    restart = false
  ) {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      // The number becomes the customerId - it's what the Journey Viewer looks sessions up by
      // later, so the two pages tie together for the demo.
      const response = await startConversation(id, entry, restart);
      applyResponse(response);
    } catch (err) {
      // Finished before: nothing to retry, just tell them (not an error banner).
      if (err instanceof ApiError && err.code === "CHAT_COMPLETED") {
        setAccess("completed");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function sendReply(rawInput: string, displayText: string) {
    if (!sessionId) return;
    setMessages((prev) => [
      ...prev,
      { id: newMessageId(), role: "user", text: displayText, time: formatClock() },
    ]);
    setOptions([]);
    setIsLoading(true);
    setError(null);
    try {
      const response = await replyToConversation(sessionId, rawInput);
      applyResponse(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleRestart() {
    setMessages([]);
    setSessionId(null);
    setStatus(null);
    setOptions([]);
    setError(null);
    // Same customer again - the Journey Viewer will just pick up the newest session. Only a backend
    // started with chat.allow-restart=true honours `restart`; otherwise a finished chat stays finished.
    void handleStart(customerId, entryCode, true);
  }

  function handleSendText(text: string) {
    void sendReply(text, text);
  }

  function handleSelectOption(option: OptionResponse) {
    // The backend matches replies literally for YES/NO, or by plain 1-based index for the
    // generic "OPTION" event code (see WorkflowEngine.matchReply) - eventCode alone is no
    // longer enough to identify which option was picked.
    const rawInput = option.eventCode === "OPTION" ? String(option.optionIndex) : option.eventCode;
    void sendReply(rawInput, option.optionLabel);
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-wa-chat shadow-xl">
      <header className="flex items-center gap-3 bg-wa-header px-3 py-2.5 text-wa-header-text">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/90 text-base font-bold text-[#004c8f]"
        >
          H
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-medium leading-tight">HDFC Bank</h1>
          <p className="truncate text-[12.5px] leading-tight opacity-80">
            {isLoading ? "typing…" : "online"}
          </p>
        </div>
        <Link href="/journey" className="shrink-0 text-xs opacity-80 hover:underline">
          Journey →
        </Link>
      </header>

      {!hasStarted && access === "needsPhone" ? (
        <PhoneGate onSubmit={handleVerify} disabled={isLoading} />
      ) : !hasStarted ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-wa-chat px-6 text-center">
          <p className="max-w-xs rounded-lg bg-wa-in px-4 py-2 text-[13px] text-wa-meta shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            {access === "checking" && "Opening your chat…"}
            {access === "ready" &&
              (isLoading
                ? "Opening your chat…"
                : "Welcome back. Tap below to continue chatting with HDFC Bank.")}
            {access === "blocked" && "This chat can only be opened from the link we sent you on WhatsApp."}
            {access === "completed" && "Feedback submitted"}
            {access === "inUse" && "This chat is already open on another device."}
          </p>
          {/* Only a fallback for when opening the chat automatically failed; while it is loading there
              is just the "Opening your chat…" line, so the button doesn't flash up. */}
          {access === "ready" && !isLoading && (
            <button
              type="button"
              onClick={() => handleStart()}
              className="rounded-full bg-wa-accent px-8 py-2.5 text-sm font-medium text-white transition-opacity hover:brightness-95"
            >
              Start chat
            </button>
          )}
          {/* Testing aid, like the restart footer: lets a finished chat be reopened where the backend allows it. */}
          {SHOW_RESTART_FOOTER && access === "completed" && customerId && (
            <button
              type="button"
              onClick={handleRestart}
              disabled={isLoading}
              className="rounded-full bg-wa-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start a new conversation
            </button>
          )}
        </div>
      ) : (
        <MessageList
          messages={messages}
          isLoading={isLoading}
          options={isActive ? options : []}
          onSelectOption={handleSelectOption}
          onOpenPay={setPaySearch}
        />
      )}

      {SHOW_RESTART_FOOTER && hasStarted && !isActive && status && (
        <div className="flex flex-col items-center gap-2 bg-wa-bar px-4 py-3">
          <p className="text-[13px] text-wa-meta">{STATUS_LABEL[status]}</p>
          <button
            type="button"
            onClick={handleRestart}
            disabled={isLoading}
            className="rounded-full bg-wa-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start a new conversation
          </button>
        </div>
      )}

      {paySearch !== null && <UpiPaySheet search={paySearch} onClose={() => setPaySearch(null)} />}

      {error && (
        <div className="bg-wa-bar px-4 pb-2">
          <div className="rounded-lg bg-red-100 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        </div>
      )}

      {hasStarted && isActive && options.length === 0 && (
        <ChatInput onSend={handleSendText} disabled={isLoading} />
      )}
    </div>
  );
}
