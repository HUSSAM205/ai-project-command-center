// Minimal fuzzy matcher for the Cmd+K command palette (see components/ui/CommandBar.tsx).
// Deliberately small — a subsequence matcher, not a full fuzzy-search library — because the
// palette only ever scores tens to low hundreds of entries (static commands + one org's projects).

export interface FuzzyResult {
  matched: boolean;
  /** Higher is better. Only meaningful when `matched` is true. */
  score: number;
}

/**
 * True if every character of `query` appears in `text`, in order (case-insensitive), like most
 * editor "go to file" pickers. Score rewards contiguous runs and a prefix match so tighter,
 * earlier matches sort above scattered ones.
 */
export function fuzzyScore(query: string, text: string): FuzzyResult {
  const q = query.trim().toLowerCase();
  if (!q) return { matched: true, score: 0 };

  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let consecutive = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1 + consecutive * 2;
      consecutive++;
      qi++;
    } else {
      consecutive = 0;
    }
  }

  if (qi < q.length) return { matched: false, score: 0 };
  if (t.startsWith(q)) score += 10;
  return { matched: true, score };
}

/** Best score for `query` across several candidate strings (e.g. a label plus its keywords). */
export function bestFuzzyScore(query: string, candidates: string[]): number {
  let best = -1;
  for (const candidate of candidates) {
    const result = fuzzyScore(query, candidate);
    if (result.matched) best = Math.max(best, result.score);
  }
  return best;
}
