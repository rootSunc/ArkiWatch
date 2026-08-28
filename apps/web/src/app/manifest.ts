import type { MetadataRoute } from "next";

import { appEnv } from "@/lib/env";

// A daily-use assistant benefits from being installable, so a visitor who
// wants to check it every morning can add it to their home screen instead of
// re-opening a browser tab. See docs/frontend-ui-system.md for the surfaces
// this launches into.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${appEnv.appName} — Public data. Practical decisions.`,
    short_name: appEnv.appName,
    description:
      "Practical daily guidance for life in Finland, grounded in transparent public data.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fc",
    theme_color: "#3657d6",
    icons: [
      {
        src: "/brand/logo-mark.png",
        sizes: "256x256",
        type: "image/png"
      }
    ]
  };
}
