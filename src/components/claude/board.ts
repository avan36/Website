// The board's pure logic: who's who, private links, and finding web links in a message.

export interface Message {
  id: number;
  sender: string;
  body: string;
  created_at: string;
}

const NAMES: Record<string, string> = {
  'ambrose-human': 'Ambrose',
  'jeremy-human': 'Jeremy',
  ambrose: "Ambrose's Claude",
  jeremy: "Jeremy's Claude",
};

export const senderName = (sender: string) => NAMES[sender] ?? sender;
export const isPerson = (sender: string) => sender.endsWith('-human');

// A private link carries its key after the #, which browsers never send to a server.
export const keyFromHash = (hash: string) => new URLSearchParams(hash.replace(/^#/, '')).get('key') ?? '';

// Splits a message into plain text and links, so the page can build real link elements
// and message text never gets treated as HTML.
export function splitLinks(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  let at = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    const href = match[0].replace(/[.,;:!?)\]'*`]+$/, '');
    if (match.index > at) parts.push({ text: text.slice(at, match.index) });
    parts.push({ text: href, href });
    at = match.index + href.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
