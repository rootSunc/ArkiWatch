import { translateMessageKey, type LanguageMode } from "./i18n";

export function viewerStateLabel(
  isAuthenticated: boolean,
  demoMode: boolean,
  language: LanguageMode,
): string {
  if (isAuthenticated) {
    return translateMessageKey(language, "shell.signedIn");
  }

  return translateMessageKey(
    language,
    demoMode ? "shell.demoView" : "shell.publicDataView",
  );
}
