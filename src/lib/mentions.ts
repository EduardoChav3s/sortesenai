// @mentions in the chat, and the size a pasted print shrinks to before it is sent.
export type Segment = { text: string; mention?: string };

const MENTION = /@([A-Za-z0-9_]{3,20})/g;

/** Splits a message into plain text and @mentions of known players (matched in any letter case). */
export function splitMentions(text: string, nicknames: string[]): Segment[] {
  const known = new Map(nicknames.map((n) => [n.toLowerCase(), n]));
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const nick = known.get(m[1].toLowerCase());
    if (!nick) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], mention: nick });
    last = m.index + m[0].length;
  }
  if (last < text.length || out.length === 0) out.push({ text: text.slice(last) });
  // join plain pieces that ended up next to each other
  return out.reduce<Segment[]>((acc, s) => {
    const prev = acc[acc.length - 1];
    if (prev && !prev.mention && !s.mention) prev.text += s.text;
    else acc.push({ ...s });
    return acc;
  }, []);
}

/** The @word being typed right before the cursor (an @ at the start or after a space), or null. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([A-Za-z0-9_]{0,20})$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

/** Puts @nickname (and a space) where the @word was being typed. */
export function insertMention(text: string, start: number, caret: number, nickname: string): { text: string; caret: number } {
  const piece = `@${nickname} `;
  return { text: text.slice(0, start) + piece + text.slice(caret), caret: start + piece.length };
}

/** The size that fits inside max x max, keeping the shape; never grows a small picture. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
