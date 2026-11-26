"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/MessageBubble";
import { RichText } from "@/components/RichText";
import { OptionResponse } from "@/lib/api";
import { parseOption } from "@/lib/optionTag";

// How long the tapped option stays highlighted before the answer is sent: without a pause the options
// are replaced by the answer so fast that the highlight is never seen.
const HIGHLIGHT_MS = 300;

// eventCode alone isn't unique - every numbered option on a node shares "OPTION", disambiguated by
// optionIndex (YES/NO options have no index, so fall back to their label, which is unique since a node
// has at most one YES and one NO).
function optionKey(option: OptionResponse) {
  return `${option.eventCode}-${option.optionIndex ?? option.optionLabel}`;
}

/** Renders one entry per line, in the order the backend sent them (display order), under the bot message.
 * An ordinary option is a full-width button, a little different in colour from the page; the tapped one gets a
 * highlighted border and the answer is sent right after (there is no separate submit). An option labelled
 * [[button:Label|url]] is a green button that only opens its link: it sends no answer, so the question stays open
 * (and the button tappable) until an ordinary option is chosen, which disables it; one labelled
 * [[note:text]] is a bubble of information that can't be tapped (see lib/optionTag.ts).
 * `frozen` is how an answered question's button and note options stay on screen: nothing can be tapped. */
export function OptionButtons({
  options,
  onSelect,
  onOpenPay,
  disabled,
  frozen = false,
  inGroup = false,
}: {
  options: OptionResponse[];
  onSelect: (option: OptionResponse) => void;
  onOpenPay: (search: string) => void;
  disabled: boolean;
  frozen?: boolean;
  /** Drawn inside a master bubble: full width, notes in white. */
  inGroup?: boolean;
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
    <div className={`flex flex-col gap-1.5 ${inGroup ? "w-full" : "max-w-[85%] sm:max-w-[75%]"}`}>
      {options.map((option) => {
        const key = optionKey(option);
        const parsed = parseOption(option.optionLabel);
        if (parsed.kind === "note") {
          return (
            <div
              key={key}
              className={`whitespace-pre-wrap break-words rounded-lg ${inGroup ? "bg-white" : "bg-wa-in"} px-2.5 py-1.5 text-[14.2px] leading-[19px] text-wa-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]`}
            >
              <RichText text={parsed.text} />
            </div>
          );
        }
        if (parsed.kind === "button") {
          return (
            <div key={key} className="-mt-2">
              <ActionButton
                button={parsed.button}
                onOpenPay={onOpenPay}
                disabled={frozen || disabled || chosen !== null}
              />
            </div>
          );
        }
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
