import { cookies } from "next/headers";
import { parseLocale, DEFAULT_LOCALE, type Locale } from "./index";

/** Cookie that stores the global site/UI language (independent of any deck). */
export const UI_LOCALE_COOKIE = "uiLocale";

/**
 * Resolve the global site/UI locale for the current request from its cookie.
 * Server-only (uses next/headers); falls back to the default locale (fr).
 */
export function getServerUiLocale(): Locale {
  const value = cookies().get(UI_LOCALE_COOKIE)?.value;
  return value ? parseLocale(value) : DEFAULT_LOCALE;
}
