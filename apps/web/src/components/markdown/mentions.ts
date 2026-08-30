export interface MentionName {
  id: string;
  displayName: string;
}

export interface MentionRange {
  start: number;
  end: number;
  user: MentionName;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Same matching rules as the API parser (TFG-33): case-insensitive, longest first, word boundary. */
export function findMentionRanges(text: string, names: MentionName[]): MentionRange[] {
  if (!text || !text.includes('@') || names.length === 0) return [];

  const sorted = [...names].sort((a, b) => b.displayName.length - a.displayName.length);
  const ranges: MentionRange[] = [];

  for (const user of sorted) {
    if (!user.displayName) continue;
    const pattern = new RegExp(escapeRegExp(`@${user.displayName}`), 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > 0 && /[a-z0-9]/i.test(text[start - 1])) continue;
      if (/[a-z0-9]/i.test(text[end] ?? '')) continue;
      if (ranges.some((r) => start < r.end && end > r.start)) continue;
      ranges.push({ start, end, user });
      break;
    }
  }
  return ranges;
}

/**
 * DOM pass run by tiptap-markdown's `parse.updateDOM`: rewrites `@Name` text
 * nodes into `span[data-mention]` chips the Mention mark can pick up. Text
 * matching operates per text node — mentions split across formatting marks
 * (e.g. `**@emre**`) are not detected. Acceptable for v1.
 */
export function addMentionSpans(root: HTMLElement, names: MentionName[]): void {
  if (names.length === 0) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest('pre')) continue;
    const text = textNode.textContent ?? '';
    const hits = findMentionRanges(text, names);
    if (hits.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const hit of hits) {
      if (hit.start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, hit.start)));
      }
      const span = document.createElement('span');
      span.setAttribute('data-mention', hit.user.displayName);
      span.setAttribute('data-user-id', hit.user.id);
      span.textContent = text.slice(hit.start, hit.end);
      fragment.appendChild(span);
      cursor = hit.end;
    }
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }
    textNode.replaceWith(fragment);
  }
}
