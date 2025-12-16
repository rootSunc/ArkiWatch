type AppEnv = {
  appName: string;
  timezone: string;
  defaultUserId: string;
};

export const appEnv: AppEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "ArkiWatch",
  timezone: process.env.APP_TIMEZONE ?? "Europe/Helsinki",
  defaultUserId: process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? ""
};
