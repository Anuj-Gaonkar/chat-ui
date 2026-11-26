import { Fragment } from "react";

// Chat text may mark bold with **double asterisks**, colour with [[color:#RRGGBB|text]] (the text may hold bold)
// and link with [[link:https://...|text]], shown bold and underlined and opened in a new tab. Those are the only
// markup supported, and they are rendered as React elements (never as HTML), so message text can't inject
// anything. A colour must be a hex code (#RGB, #RRGGBB or #RRGGBBAA) and a link an https URL; a tag with
// anything else is left out and its text shows plainly. A tag must start and end on one line.
const TAG = /\[\[(color|link):([^|\]]*)\|(.*?)\]\]/g;
const BOLD = /\*\*(.+?)\*\*/g;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const HTTPS_URL = /^https:\/\/\S+$/i;

/** The text with each link tag replaced by its label: what the message says, without the URLs inside the tags. */
export function stripInlineLinks(text: string): string {
  return text.replace(/\[\[link:[^|\]]*\|(.*?)\]\]/g, "$1");
}

function withBold(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TAG)) {
    if (match.index > last) parts.push(...withBold(text.slice(last, match.index)));
    const kind = match[1];
    const value = match[2].trim();
    const inner = withBold(match[3]);
    if (kind === "color" && HEX_COLOR.test(value)) {
      parts.push(
        <span key={`color-${match.index}`} style={{ color: value }}>
          {inner}
        </span>
      );
    } else if (kind === "link" && HTTPS_URL.test(value)) {
      parts.push(
        <a
          key={`link-${match.index}`}
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-wa-link underline"
        >
          {inner}
        </a>
      );
    } else {
      parts.push(...inner);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(...withBold(text.slice(last)));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}
