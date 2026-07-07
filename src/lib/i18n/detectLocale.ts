import { DEFAULT_LOCALE, type Locale } from "../constants";

/**
 * Hard, deterministic French/English identification for inbound emails.
 *
 * This is intentionally dependency-free and rule-based (no model call) so every
 * inbound email is classified into exactly one language and the entire reply can
 * be produced in that language. French is the default tie-breaker (Quebec launch).
 *
 * Signals, in rough order of strength:
 *  - French diacritics (é, è, à, ç, …) are a very strong French indicator.
 *  - Counts of common French vs. English function words / QBR vocabulary.
 */

const FRENCH_DIACRITICS = /[àâäçéèêëîïôöùûüÿœæ]/i;

const FRENCH_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "est", "sont", "ont",
  "vous", "nous", "je", "tu", "il", "elle", "ils", "elles", "on", "ce", "cet", "cette", "ces",
  "que", "qui", "quoi", "pas", "plus", "pour", "avec", "sans", "sur", "dans", "au", "aux",
  "bonjour", "merci", "cordialement", "salutations", "veuillez", "ci-joint", "joint", "jointe",
  "suivi", "prochaine", "prochain", "reunion", "réunion", "rencontre", "trimestre", "trimestriel",
  "client", "compte", "creer", "créer", "nouveau", "nouvelle", "ajouter", "modifier", "supprimer",
  "presentation", "présentation", "diapositive", "diapositives", "besoin", "date", "prevue", "prévue",
  "mise", "jour", "votre", "vôtre", "notre", "etre", "être", "faire", "donnees", "données",
  "objectifs", "priorites", "priorités", "indicateurs", "tableau", "bord", "ouvert", "termine", "terminé",
]);

const ENGLISH_WORDS = new Set([
  "the", "a", "an", "and", "or", "is", "are", "was", "were", "has", "have", "had",
  "you", "we", "i", "he", "she", "they", "it", "this", "that", "these", "those",
  "which", "who", "what", "not", "more", "for", "with", "without", "on", "in", "at", "to",
  "hello", "hi", "thanks", "thank", "please", "regards", "sincerely", "best", "attached",
  "follow", "up", "next", "meeting", "quarter", "quarterly", "client", "account", "create",
  "new", "your", "our", "need", "date", "deck", "slide", "slides", "presentation", "update",
  "review", "draft", "approve", "finalize", "metrics", "priorities", "dashboard", "upcoming",
  "open", "done", "complete", "owner", "status", "add", "edit", "remove", "delete", "set",
]);

/**
 * Detect whether an email is written in French or English.
 *
 * @returns "fr" or "en" — never null. Ties resolve to the default locale (fr).
 */
export function detectEmailLocale(...parts: Array<string | null | undefined>): Locale {
  const text = parts.filter(Boolean).join("\n").toLowerCase();
  if (!text.trim()) return DEFAULT_LOCALE;

  let frScore = 0;
  let enScore = 0;

  // Diacritics are a strong French signal in an FR/EN corpus.
  if (FRENCH_DIACRITICS.test(text)) frScore += 3;

  const tokens = text.split(/[^a-zàâäçéèêëîïôöùûüÿœæ'-]+/i).filter(Boolean);
  for (const token of tokens) {
    if (FRENCH_WORDS.has(token)) frScore += 1;
    if (ENGLISH_WORDS.has(token)) enScore += 1;
  }

  if (enScore > frScore) return "en";
  if (frScore > enScore) return "fr";
  return DEFAULT_LOCALE;
}
