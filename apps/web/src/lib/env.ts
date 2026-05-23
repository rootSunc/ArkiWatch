type AppEnv = {
  appName: string;
  appOrigin: string;
  demoMode: boolean;
  timezone: string;
  defaultUserId: string;
};

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export const appEnv: AppEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "ArkiWatch",
  appOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
  demoMode: parseBoolean(process.env.NEXT_PUBLIC_DEMO_MODE),
  timezone: process.env.APP_TIMEZONE ?? "Europe/Helsinki",
  defaultUserId: process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? ""
};
