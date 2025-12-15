type AppEnv = {
  appName: string;
  timezone: string;
};

export const appEnv: AppEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "ArkiWatch",
  timezone: process.env.APP_TIMEZONE ?? "Europe/Helsinki"
};
