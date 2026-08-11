import { FrameStep } from "@/lib/api";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** One node hop in a reconstructed journey - a bot bubble (if this node has customer-facing
 * text), the options that were on screen for a QUESTION node with the chosen one highlighted,
 * or a free-text reply bubble for an INPUT node. ACTION nodes render as a small system line -
 * they're never shown to the customer, but they explain how values like payment_link appeared. */
export function JourneyStep({ step }: { step: FrameStep }) {
  if (step.nodeType === "ACTION") {
    return (
      <div className="flex items-center gap-2 py-1 pl-1 text-xs text-gray-400 dark:text-gray-500">
        <span aria-hidden>⚙</span>
        <span className="font-mono">{step.nodeCode}</span>
        <span>—</span>
        <span>{step.eventCode}</span>
        <span className="ml-auto font-mono">{formatTime(step.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
        <span className="font-mono">{step.nodeCode}</span>
        <span className="ml-auto font-mono">{formatTime(step.timestamp)}</span>
      </div>

      {step.message && (
        <div className="flex justify-start">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-sm leading-relaxed text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100">
            {step.message}
          </div>
        </div>
      )}

      {step.optionsShown.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {step.optionsShown.map((option) => (
            <span
              key={`${option.optionIndex}-${option.optionLabel}`}
              className={
                option.chosen
                  ? "rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
              }
            >
              {option.optionLabel}
            </span>
          ))}
        </div>
      )}

      {!step.matched && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            typed &ldquo;{step.rawInput}&rdquo; — not a valid option, asked again
          </div>
        </div>
      )}

      {step.matched && step.nodeType === "INPUT" && step.rawInput && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-1.5 text-xs text-white">
            {step.rawInput}
          </div>
        </div>
      )}
    </div>
  );
}
