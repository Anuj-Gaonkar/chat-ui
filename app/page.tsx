"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage, formatClock } from "@/components/MessageBubble";
import { MessageList } from "@/components/MessageList";
import {
  ApiError,
  ConversationResponse,
  OptionResponse,
  SessionStatus,
  replyToConversation,
  startConversation,
  verifyAccessToken,
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

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [options, setOptions] = useState<OptionResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasStarted = sessionId !== null;
  const isActive = status === "ACTIVE";

  function applyResponse(response: ConversationResponse) {
    setSessionId(response.sessionId);
    setStatus(response.status);
    setOptions(response.options);
    setMessages((prev) => [
      ...prev,
      { id: newMessageId(), role: "bot", text: response.message, time: formatClock() },
    ]);
  }

  async function handleStart(phone: string = phoneNumber) {
    const trimmed = phone.trim();
    if (!trimmed) return;
    // Opened from the WhatsApp CTA link, /?t=<token>. The token is tied to the number the link
    // was sent to; the customer types that number and the backend checks the two match.
    const token = new URLSearchParams(window.location.search).get("t");
    // Local dev (`next dev`) skips the WhatsApp-link check so a number can be typed at localhost:3000.
    const isDev = process.env.NODE_ENV === "development";
    if (!token && !isDev) {
      setError("This chat can only be opened from the link we sent you on WhatsApp.");
      return;
    }

    // Keeps the number for handleRestart when it came from the URL rather than the input.
    setPhoneNumber(trimmed);
    setIsLoading(true);
    setError(null);
    try {
      if (token) await verifyAccessToken(token, trimmed);
      // The phone number becomes the customerId - it's what the Journey Viewer looks
      // sessions up by later, so the two pages tie together for the demo.
      const response = await startConversation(trimmed);
      applyResponse(response);
    } catch (err) {
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

  function handleRestart() {
    setMessages([]);
    setSessionId(null);
    setStatus(null);
    setOptions([]);
    setError(null);
    // Keep the same phone number by default - restarting is usually "run it again for the
    // same test customer", and the Journey Viewer will just pick up the newest session.
    void handleStart();
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

      {!hasStarted ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-wa-chat px-6 text-center">
          <p className="max-w-xs rounded-lg bg-wa-in px-4 py-2 text-[13px] text-wa-meta shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            Enter your phone number to start chatting with HDFC Bank.
          </p>
          <input
            type="tel"
            inputMode="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            placeholder="Phone number"
            className="w-full max-w-xs rounded-lg bg-wa-input px-4 py-2.5 text-center text-[15px] text-wa-text outline-none placeholder:text-wa-meta"
          />
          <button
            type="button"
            onClick={() => handleStart()}
            disabled={isLoading || !phoneNumber.trim()}
            className="rounded-full bg-wa-accent px-8 py-2.5 text-sm font-medium text-white transition-opacity hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Starting…" : "Start chat"}
          </button>
        </div>
      ) : (
        <MessageList
          messages={messages}
          isLoading={isLoading}
          options={isActive ? options : []}
          onSelectOption={handleSelectOption}
        />
      )}

      {hasStarted && !isActive && status && (
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
