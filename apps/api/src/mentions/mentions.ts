export interface MentionCandidate {
  id: string;
  displayName: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves `@<DisplayName>` tokens in `text` against candidate users.
 *
 * Rules (TFG-33):
 * - case-insensitive, exact displayName match (no partials)
 * - longest displayName wins when names overlap (`@emreyc` prefers "emreyc" over "emre")
 * - a match may not be followed by a letter/digit, so `@emre` does not match "emreyc"
 *   when only "emre" exists
 * - after a boundary check, a shorter match at an occupied range is skipped
 */
export function parseMentions(text: string, candidates: MentionCandidate[]): MentionCandidate[] {
  if (!text || !text.includes('@') || candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => b.displayName.length - a.displayName.length);
  const claimed: Array<[number, number]> = [];
  const resolved: MentionCandidate[] = [];

  for (const candidate of sorted) {
    if (!candidate.displayName) continue;
    const pattern = new RegExp(escapeRegExp(`@${candidate.displayName}`), 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > 0 && /[a-z0-9]/i.test(text[start - 1])) continue;
      if (/[a-z0-9]/i.test(text[end] ?? '')) continue;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      claimed.push([start, end]);
      if (!resolved.some((c) => c.id === candidate.id)) resolved.push(candidate);
      break;
    }
  }
  return resolved;
}
