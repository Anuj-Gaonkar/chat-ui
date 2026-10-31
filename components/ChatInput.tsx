"use client";

import { FormEvent, useState } from "react";

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-wa-bar px-3 py-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Type a message"
        className="flex-1 rounded-full bg-wa-input px-4 py-2.5 text-[15px] text-wa-text outline-none placeholder:text-wa-meta disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wa-accent text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
          <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
        </svg>
      </button>
    </form>
  );
}
