import type { ChatButton } from "@/lib/api";
import { parseSegments } from "@/lib/buttonToken";

// An answer option's label may be a tag instead of plain text:
//   [[button:Label|url]]  a green button ("/pay" opens the UPI payment sheet, an https URL opens in a new tab);
//                         tapping it also sends the option as the customer's answer.
//   [[note:text]]         a line of information shown as its own bubble among the options; it can't be tapped.
// Any other label is an ordinary option. The tag must be the whole label; a label that only contains one is
// shown as it is.
const NOTE = /^\[\[note:([\s\S]*)\]\]$/;

export type OptionKind =
  | { kind: "button"; button: ChatButton }
  | { kind: "note"; text: string }
  | { kind: "plain"; label: string };

export function parseOption(label: string): OptionKind {
  const trimmed = label.trim();
  const note = NOTE.exec(trimmed);
  if (note && note[1].trim()) return { kind: "note", text: note[1].trim() };
  if (trimmed.startsWith("[[button:") && trimmed.endsWith("]]")) {
    const segments = parseSegments(trimmed);
    if (segments.length === 1 && segments[0].kind === "button") return { kind: "button", button: segments[0].button };
  }
  return { kind: "plain", label };
}

/** What the customer's answer reads as in the chat: a button's label, a note's text, otherwise the label itself. */
export function optionDisplayText(label: string): string {
  const option = parseOption(label);
  if (option.kind === "button") return option.button.label;
  if (option.kind === "note") return option.text;
  return option.label;
}
