import { Fragment } from "react";

// Chat text may mark bold with **double asterisks**, and colour with [[color:#RRGGBB|text]] (the text may hold
// bold). Those are the only markup supported, and they are rendered as React elements (never as HTML), so message
// text can't inject anything. The colour must be a hex code (#RGB, #RRGGBB or #RRGGBBAA); a tag with any other
// colour is left out and its text shows in the normal colour. A tag must start and end on one line.
const COLOR = /\[\[color:([^|\]]*)\|(.*?)\]\]/g;
const BOLD = /\*\*(.+?)\*\*/g;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

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
  for (const match of text.matchAll(COLOR)) {
    if (match.index > last) parts.push(...withBold(text.slice(last, match.index)));
    const color = match[1].trim();
    const inner = withBold(match[2]);
    if (HEX_COLOR.test(color)) {
      parts.push(
        <span key={`color-${match.index}`} style={{ color }}>
          {inner}
        </span>
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
