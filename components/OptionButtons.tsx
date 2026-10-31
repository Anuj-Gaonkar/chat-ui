import { OptionResponse } from "@/lib/api";

/** Renders one option per line, in the order the backend sent them (display order), styled
 * like WhatsApp's interactive reply buttons: full-width white pills under the bot message. */
export function OptionButtons({
  options,
  onSelect,
  disabled,
}: {
  options: OptionResponse[];
  onSelect: (option: OptionResponse) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]">
      {options.map((option) => (
        <button
          // eventCode alone isn't unique - every numbered option on a node shares "OPTION",
          // disambiguated by optionIndex (YES/NO options have no index, so fall back to their
          // label, which is unique since a node has at most one YES and one NO).
          key={`${option.eventCode}-${option.optionIndex ?? option.optionLabel}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option)}
          className="w-full rounded-lg bg-wa-in px-3 py-2.5 text-center text-[14.2px] font-medium text-wa-link shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {option.optionLabel}
        </button>
      ))}
    </div>
  );
}
