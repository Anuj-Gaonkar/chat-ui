"use client";

import { useEffect, useRef } from "react";
import { OptionResponse } from "@/lib/api";
import { ChatMessage, MessageBubble } from "./MessageBubble";
import { OptionButtons } from "./OptionButtons";

export function MessageList({
  messages,
  isLoading,
  options,
  onSelectOption,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  options: OptionResponse[];
  onSelectOption: (option: OptionResponse) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, options.length, isLoading]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Options for the current question sit directly under the message that asked it,
          one per line in display order - not pinned in a separate bar at the bottom. */}
      {options.length > 0 && (
        <OptionButtons options={options} onSelect={onSelectOption} disabled={isLoading} />
      )}

      {isLoading && (
        <div className="flex justify-start">
          <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3 dark:bg-gray-800">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
