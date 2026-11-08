import { cookies } from "next/headers";

import { isLanguageMode, LANGUAGE_COOKIE, type LanguageMode } from "./language";

/** The viewer's language as the server can know it, defaulting to English. */
export async function requestLanguage(): Promise<LanguageMode> {
  const value = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  return isLanguageMode(value) ? value : "en";
}
