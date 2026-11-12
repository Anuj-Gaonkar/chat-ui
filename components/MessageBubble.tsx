import { RichText } from "@/components/RichText";
import { logPayOpened, type ChatButton } from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "bot" | "user";
  text: string;
  /** Pre-formatted local time, e.g. "10:42 AM". */
  time: string;
  /** A button the backend attached to this message, if any. */
  button?: ChatButton | null;
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

// The button opens chat-ui's UPI payment sheet over the chat (never the https link in the message
// text), which hands off to the phone's UPI apps: the app chooser on Android, a list of apps on iOS.
// The payee is set at build time via NEXT_PUBLIC_UPI_PAYEE_VPA + NEXT_PUBLIC_UPI_PAYEE_NAME
// (optionally NEXT_PUBLIC_UPI_AMOUNT and NEXT_PUBLIC_UPI_NOTE). Without a payee the sheet is a plain
// app launcher that pays no one. The variables are read by their full names so Next can inline them.
function buildPaySearch() {
  const params = new URLSearchParams();
  const vpa = process.env.NEXT_PUBLIC_UPI_PAYEE_VPA;
  const name = process.env.NEXT_PUBLIC_UPI_PAYEE_NAME;
  if (vpa && name) {
    params.set("pa", vpa);
    params.set("pn", name);
    const amount = process.env.NEXT_PUBLIC_UPI_AMOUNT;
    if (amount) params.set("am", amount);
    params.set("tn", process.env.NEXT_PUBLIC_UPI_NOTE ?? "Account funding");
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

const PAY_SEARCH = buildPaySearch();

const BUTTON_CLASS =
  "flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-[14.2px] font-medium text-wa-link transition-colors hover:bg-black/5";

const CARD_ICON = (
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
);

const LINK_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

// What the bubble's button does: "/pay" opens chat-ui's UPI payment sheet over the chat, an https URL
// opens in a new tab. Anything else is ignored, so a bad value in the database can't become a clickable link.
function ActionButton({ button, onOpenPay }: { button: ChatButton; onOpenPay: (search: string) => void }) {
  if (button.url === "/pay") {
    return (
      <div className="mt-2 border-t border-wa-divider">
        <button
          type="button"
          onClick={() => {
            logPayOpened();
            onOpenPay(PAY_SEARCH);
          }}
          className={BUTTON_CLASS}
        >
          {CARD_ICON}
          {button.label}
        </button>
      </div>
    );
  }
  if (!/^https:\/\//i.test(button.url)) return null;
  return (
    <div className="mt-2 border-t border-wa-divider">
      <a href={button.url} target="_blank" rel="noopener noreferrer" className={BUTTON_CLASS}>
        {LINK_ICON}
        {button.label}
      </a>
    </div>
  );
}

// The original chat attaches no button of its own; it signals a payment in the text, so the Fund
// button is still shown for those messages.
const LEGACY_FUND_BUTTON: ChatButton = { label: "Fund your account", url: "/pay" };

export function MessageBubble({
  message,
  showTail,
  onOpenPay,
}: {
  message: ChatMessage;
  showTail: boolean;
  /** Opens the payment sheet; `search` is the query string with the payee details. */
  onOpenPay: (search: string) => void;
}) {
  const isBot = message.role === "bot";
  const lines = message.text.split("\n");
  // A button from the backend wins. Without one, a link in the bot message marks it as a payment
  // message (the link itself is not used); the original chat's "fund now" reply only says "the below
  // attached secured link" without embedding one, so that wording counts too.
  const hasPaymentLink =
    isBot && (findPaymentUrl(message.text) !== undefined || PAYMENT_PROMPT.test(message.text));
  const button = !isBot ? null : (message.button ?? (hasPaymentLink ? LEGACY_FUND_BUTTON : null));

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
              <RichText text={line} />
            </p>
          ))}
        </div>
        <div className="-mb-0.5 mt-0.5 flex items-center justify-end gap-1 text-[11px] leading-none text-wa-meta">
          <span>{message.time}</span>
          {!isBot && <DoubleTick />}
        </div>
        {button && <ActionButton button={button} onOpenPay={onOpenPay} />}
      </div>
    </div>
  );
}
