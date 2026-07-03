export type RuntimeConfig = {
  apiBaseUrl?: string;
};

declare global {
  interface Window {
    __ARKIWATCH_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

export function runtimeApiBaseUrl(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.__ARKIWATCH_RUNTIME_CONFIG__?.apiBaseUrl;
}
