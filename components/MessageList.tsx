"use client";

import { useEffect, useRef } from "react";
import { OptionResponse } from "@/lib/api";
import { ChatMessage, MessageBubble } from "./MessageBubble";
import { OptionButtons } from "./OptionButtons";
import { parseOption } from "@/lib/optionTag";

// A button or note option goes inside the question's master bubble; an ordinary option goes under it.
function isExtra(option: OptionResponse) {
  return parseOption(option.optionLabel).kind !== "plain";
}

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
        // A question's button and note options sit right under its bubble (the ordinary options go under them).
        // While the question is pending they come from `options`; once it is answered they were kept on the message.
        const pending = i === messages.length - 1 && message.role === "bot" && options.length > 0;
        const extras = pending ? options.filter(isExtra) : (message.kept ?? []);
        return (
          <div key={message.id} className={showTail && i > 0 ? "pt-2" : undefined}>
            <MessageBubble message={message} showTail={showTail} onOpenPay={onOpenPay} />
            {extras.length > 0 && (
              <div className="pt-1">
                <OptionButtons
                  options={extras}
                  onSelect={pending ? onSelectOption : () => {}}
                  onOpenPay={onOpenPay}
                  disabled={pending && isLoading}
                  frozen={!pending && !message.keptActive}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* The ordinary options of the current question sit directly under the message that asked it,
          one per line in display order - not pinned in a separate bar at the bottom. */}
      {options.some((option) => !isExtra(option)) && (
        <div className="pt-1">
          <OptionButtons
            options={options.filter((option) => !isExtra(option))}
            onSelect={onSelectOption}
            onOpenPay={onOpenPay}
            disabled={isLoading}
          />
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
