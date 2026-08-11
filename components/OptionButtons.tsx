import { OptionResponse } from "@/lib/api";

/** Renders one option per line, in the order the backend sent them (display order). */
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
    <div className="flex flex-col items-start gap-2 px-4 pb-2">
      {options.map((option) => (
        <button
          // eventCode alone isn't unique - every numbered option on a node shares "OPTION",
          // disambiguated by optionIndex (YES/NO options have no index, so fall back to their
          // label, which is unique since a node has at most one YES and one NO).
          key={`${option.eventCode}-${option.optionIndex ?? option.optionLabel}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option)}
          className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm border border-blue-600 px-4 py-2 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950 sm:max-w-[75%]"
        >
          {option.optionLabel}
        </button>
      ))}
    </div>
  );
}
