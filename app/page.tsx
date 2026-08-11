"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatInput } from "@/components/ChatInput";
import { ChatMessage } from "@/components/MessageBubble";
import { MessageList } from "@/components/MessageList";
import {
  ApiError,
  ConversationResponse,
  OptionResponse,
  SessionStatus,
  replyToConversation,
  startConversation,
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
      { id: newMessageId(), role: "bot", text: response.message },
    ]);
  }

  async function handleStart() {
    const trimmed = phoneNumber.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    try {
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
      { id: newMessageId(), role: "user", text: displayText },
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
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-white dark:bg-black">
      <header className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            HDFC Chatbot — Test Harness
          </h1>
          <Link href="/journey" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            View a journey →
          </Link>
        </div>
      </header>

      {!hasStarted ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="max-w-sm text-sm text-gray-600 dark:text-gray-400">
            Starts a test conversation against the AMB shortfall flow.
          </p>
          <input
            type="tel"
            inputMode="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            placeholder="Customer phone number"
            className="w-full max-w-xs rounded-full border border-gray-300 bg-white px-4 py-2 text-center text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={handleStart}
            disabled={isLoading || !phoneNumber.trim()}
            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Starting…" : "Start conversation"}
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
        <div className="flex flex-col items-center gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">{STATUS_LABEL[status]}</p>
          <button
            type="button"
            onClick={handleRestart}
            disabled={isLoading}
            className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start a new conversation
          </button>
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {hasStarted && isActive && options.length === 0 && (
        <ChatInput onSend={handleSendText} disabled={isLoading} />
      )}
    </div>
  );
}
