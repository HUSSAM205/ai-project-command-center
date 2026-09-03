/**
 * Client-only write simulation for anonymous/demo sessions (see lib/auth.tsx — every visitor gets
 * an auto-established read-only session with no signup wall). The backend's write endpoints are
 * genuinely gated (require_write_access — backend/app/core/deps.py) and stay that way: a public,
 * unauthenticated link must never have real write access to the shared seeded portfolio, or one
 * visitor could delete or spam it for everyone else, and document uploads would run the real
 * (cost-incurring) AI extraction pipeline for anyone who finds the link.
 *
 * Instead, a demo session's creates/edits/deletes apply to local component state only — the same
 * pattern the Documents page already uses for its "local preview" upload — so the product feels
 * fully interactive with no 403 dead ends, without ever touching the shared backend. This is
 * scoped to the current page visit (not persisted across navigation or reload), same as the
 * existing Documents local-preview list.
 */

let counter = 0;

/** IDs from this generator are always distinguishable from real (UUID) backend ids. */
export function makePreviewId(): string {
  counter += 1;
  return `preview-${Date.now()}-${counter.toString(36)}`;
}

export function isPreviewId(id: string): boolean {
  return id.startsWith("preview-");
}

/** A short, realistic delay so a simulated write doesn't resolve suspiciously instantly. */
export function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 350 + Math.random() * 300));
}
