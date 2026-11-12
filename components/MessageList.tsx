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
  onOpenPay,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  options: OptionResponse[];
  onSelectOption: (option: OptionResponse) => void;
  onOpenPay: (search: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, options.length, isLoading]);

  return (
    <div className="wa-wallpaper flex-1 space-y-0.5 overflow-y-auto px-3 py-3 sm:px-6">
      {messages.length > 0 && (
        <div className="flex justify-center pb-2">
          <span className="rounded-lg bg-wa-in px-3 py-1 text-[12.5px] uppercase text-wa-meta shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            Today
          </span>
        </div>
      )}
      {messages.map((message, i) => {
        // WhatsApp draws the bubble "tail" only on the first bubble of a run from one sender.
        const showTail = i === 0 || messages[i - 1].role !== message.role;
        return (
          <div key={message.id} className={showTail && i > 0 ? "pt-2" : undefined}>
            <MessageBubble message={message} showTail={showTail} onOpenPay={onOpenPay} />
          </div>
        );
      })}

      {/* Options for the current question sit directly under the message that asked it,
          one per line in display order - not pinned in a separate bar at the bottom. */}
      {options.length > 0 && (
        <div className="pt-1">
          <OptionButtons options={options} onSelect={onSelectOption} disabled={isLoading} />
        </div>
      )}

      {isLoading && (
        <div className="flex justify-start pt-2">
          <div className="flex items-center gap-1 rounded-lg rounded-tl-none bg-wa-in px-3 py-3 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-wa-meta [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-wa-meta [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-wa-meta" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
