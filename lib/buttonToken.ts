import type { ChatButton } from "@/lib/api";

// A bot text can hold a button of its own, in the middle of the text: [[button:Label|url]] (url is "/pay" for
// chat-ui's UPI payment page, or an https URL). The bubble then shows the text before it, the button, and the
// text after it, all in the same bubble. A token that is not well formed (no label, or a url of any other
// kind) is simply left out of the text.
const TOKEN = /\[\[button:([^|\]]*)\|([^\]]*)\]\]/g;

export type Segment = { kind: "text"; text: string } | { kind: "button"; button: ChatButton };

function toButton(label: string, url: string): ChatButton | null {
  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  if (!trimmedLabel) return null;
  if (trimmedUrl === "/pay" || /^https:\/\//i.test(trimmedUrl)) return { label: trimmedLabel, url: trimmedUrl };
  return null;
}

/** Cuts a bot text into the pieces of its bubble, in order: text, then a button where a token was, then text. */
export function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let pending = "";
  let from = 0;
  for (const match of text.matchAll(TOKEN)) {
    pending += text.slice(from, match.index);
    from = match.index + match[0].length;
    const button = toButton(match[1], match[2]);
    if (button) {
      if (pending.trim()) segments.push({ kind: "text", text: pending.trim() });
      segments.push({ kind: "button", button });
      pending = "";
    }
  }
  pending += text.slice(from);
  if (pending.trim() || segments.length === 0) segments.push({ kind: "text", text: pending.trim() });
  return segments;
}

/** The text without its button tokens: how a turn the customer has already answered is shown. */
export function stripButtonTokens(text: string): string {
  return text.replace(TOKEN, "").trim();
}
