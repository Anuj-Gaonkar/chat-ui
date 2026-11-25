"use client";

import { useEffect, useRef, useState } from "react";
import { OptionResponse } from "@/lib/api";

// How long the tapped option stays highlighted before the answer is sent: without a pause the options
// are replaced by the answer so fast that the highlight is never seen.
const HIGHLIGHT_MS = 300;

// eventCode alone isn't unique - every numbered option on a node shares "OPTION", disambiguated by
// optionIndex (YES/NO options have no index, so fall back to their label, which is unique since a node
// has at most one YES and one NO).
function optionKey(option: OptionResponse) {
  return `${option.eventCode}-${option.optionIndex ?? option.optionLabel}`;
}

/** Renders one option per line, in the order the backend sent them (display order): full-width buttons under
 * the bot message, a little different in colour from the page. The tapped one gets a highlighted border and the
 * answer is sent right after; there is no separate submit. */
export function OptionButtons({
  options,
  onSelect,
  disabled,
}: {
  options: OptionResponse[];
  onSelect: (option: OptionResponse) => void;
  disabled: boolean;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nothing is sent after the options have gone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function choose(option: OptionResponse) {
    if (chosen !== null) return;
    setChosen(optionKey(option));
    timer.current = setTimeout(() => onSelect(option), HIGHLIGHT_MS);
  }

  return (
    <div className="flex max-w-[85%] flex-col gap-1.5 sm:max-w-[75%]">
      {options.map((option) => {
        const key = optionKey(option);
        const isChosen = key === chosen;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled || chosen !== null}
            aria-pressed={isChosen}
            onClick={() => choose(option)}
            className={`w-full rounded-lg border px-3 py-2.5 text-center text-[14.2px] font-semibold text-wa-link transition-colors disabled:cursor-not-allowed ${
              isChosen
                ? "border-wa-accent bg-wa-option-selected ring-2 ring-wa-accent disabled:opacity-100"
                : "border-wa-option-border bg-wa-option hover:brightness-95 disabled:opacity-50"
            }`}
          >
            {option.optionLabel}
          </button>
        );
      })}
    </div>
  );
}
