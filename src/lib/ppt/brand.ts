/**
 * Backward-compatibility re-exports. All formatting now lives in deckTheme.ts
 * (the single source of truth). This module is kept so existing imports of
 * BRAND / FONT / SECTION_BLURBS continue to work.
 */
export { BRAND, FONT, SECTION_BLURBS } from "./deckTheme";
