import type { ChatButton } from "@/lib/api";

// A bot text can hold a button of its own, in the middle of the text: [[button:Label|url]] (url is "/pay" for
// chat-ui's UPI payment page, or an https URL). The text up to the token is one bubble with that button under
// it; what follows starts the next bubble. A token that is not well formed (no label, or a url of any other
// kind) is simply left out of the text.
const TOKEN = /\[\[button:([^|\]]*)\|([^\]]*)\]\]/g;

export interface MessagePart {
  text: string;
  button: ChatButton | null;
}

function toButton(label: string, url: string): ChatButton | null {
  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  if (!trimmedLabel) return null;
  if (trimmedUrl === "/pay" || /^https:\/\//i.test(trimmedUrl)) return { label: trimmedLabel, url: trimmedUrl };
  return null;
}

/**
 * Cuts a bot text into bubbles at its button tokens. `lastButton` (the button the backend sent with the
 * message) goes under the final bubble. With `showButtons` false every token is only removed, which is how
 * the turns the customer has already answered are shown. A text that ends in a token has no final bubble, so
 * `lastButton` is not shown for it.
 */
export function splitAtButtons(text: string, lastButton: ChatButton | null, showButtons: boolean): MessagePart[] {
  const parts: MessagePart[] = [];
  let pending = "";
  let from = 0;
  for (const match of text.matchAll(TOKEN)) {
    pending += text.slice(from, match.index);
    from = match.index + match[0].length;
    const button = showButtons ? toButton(match[1], match[2]) : null;
    if (button) {
      if (pending.trim()) parts.push({ text: pending.trim(), button });
      pending = "";
    }
  }
  pending += text.slice(from);
  if (pending.trim() || parts.length === 0) {
    parts.push({ text: pending.trim(), button: lastButton });
  }
  return parts;
}
