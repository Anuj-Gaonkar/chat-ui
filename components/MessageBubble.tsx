export interface ChatMessage {
  id: string;
  role: "bot" | "user";
  text: string;
  /** Pre-formatted local time, e.g. "10:42 AM". */
  time: string;
}

export function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function DoubleTick() {
  return (
    <svg viewBox="0 0 16 11" width="16" height="11" aria-label="Read" className="text-wa-tick">
      <path
        fill="currentColor"
        d="M11.07.65 4.9 7.5 2.4 5.1l-.9.9 3.4 3.3L12 1.55l-.93-.9Zm3.1 0-6.2 6.9-.5-.48-.9.9 1.4 1.36 7.1-7.8-.9-.88Z"
      />
    </svg>
  );
}

/** The payment link the backend embeds in a bot message, if any (trailing punctuation dropped). */
function findPaymentUrl(text: string) {
  return text.match(/(?:https?|upi):\/\/[^\s]+?(?=[.,;:!?)]*(?:\s|$))/)?.[0];
}

const PAYMENT_PROMPT = /secured link/i;

// The button always opens this UPI link, never the https link in the message text. The phone's
// own chooser then lists the UPI apps installed on the device. Set the real payee in
// NEXT_PUBLIC_UPI_PAY_URL; the fallback is a placeholder and will not pay anyone real.
const UPI_PAY_URL =
  process.env.NEXT_PUBLIC_UPI_PAY_URL ??
  "upi://pay";

function PayButton() {
  return (
    <div className="mt-2 border-t border-wa-divider">
      <button
        type="button"
        onClick={() => {
          window.location.href = UPI_PAY_URL;
        }}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-[14.2px] font-medium text-wa-link transition-colors hover:bg-black/5"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18M7 15h2" />
        </svg>
        Fund your account
      </button>
    </div>
  );
}

export function MessageBubble({ message, showTail }: { message: ChatMessage; showTail: boolean }) {
  const isBot = message.role === "bot";
  const lines = message.text.split("\n");
  // A link in the bot message marks it as a payment message; the link itself is not used. The
  // backend's "fund now" reply only says "the below attached secured link" without embedding one,
  // so that wording counts too.
  const hasPaymentLink =
    isBot && (findPaymentUrl(message.text) !== undefined || PAYMENT_PROMPT.test(message.text));

  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
      <div
        className={`relative max-w-[85%] break-words rounded-lg px-2.5 py-1.5 text-[14.2px] leading-[19px] text-wa-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-[75%] ${
          isBot ? "bg-wa-in" : "bg-wa-out"
        } ${showTail ? (isBot ? "rounded-tl-none wa-tail-in" : "rounded-tr-none wa-tail-out") : ""}`}
      >
        <div className="whitespace-pre-wrap">
          {lines.map((line, i) => (
            <p key={i} className={i > 0 ? "mt-1.5" : undefined}>
              {line}
            </p>
          ))}
        </div>
        <div className="-mb-0.5 mt-0.5 flex items-center justify-end gap-1 text-[11px] leading-none text-wa-meta">
          <span>{message.time}</span>
          {!isBot && <DoubleTick />}
        </div>
        {hasPaymentLink && <PayButton />}
      </div>
    </div>
  );
}
